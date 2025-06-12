import { Agent, CredentialSession, RichText } from "@atproto/api";
import type { News } from "./news";
import sharp from "sharp";
import type { OutputSchema } from "@atproto/api/dist/client/types/com/atproto/repo/uploadBlob";
import { CronJob } from "cron";
import { $ } from "bun";

const base_url = "https://sbox.game";
const session = new CredentialSession(new URL("https://bsky.social"));

const known_orgs: { key: string; value: string }[] = [
  { key: "apetavern", value: "apetavern.com" },
  { key: "smallfish", value: "smallfi.sh" },
  { key: "carsonk", value: "carsonk.net" },
  { key: "katewoz", value: "k8woz.bsky.social" },
  { key: "nolankicks", value: "kicks13.bsky.social" },
  { key: "sharpmars", value: "sharpmars.nekoweb.org" },
];

async function run() {
  const platform_news_response = await fetch(
    "https://services.facepunch.com/sbox/news/platform"
  );
  const community_news_response = await fetch(
    "https://services.facepunch.com/sbox/news"
  );

  const new_platform_posts: News[] = [];
  const new_community_posts: News[] = [];

  if (platform_news_response.ok) {
    const news = ((await platform_news_response.json()) as News[]).reverse();

    const saved_news = (await Bun.file(".runtime/platform.json").json()) as {
      id: string;
      title: string;
    }[];

    for (const post of news) {
      if (saved_news.find((obj) => obj.id === post.Id) == undefined) {
        new_platform_posts.push(post);
      }
    }

    if (new_platform_posts.length > 0)
      Bun.write(
        ".runtime/platform.json",
        JSON.stringify(
          news.map((obj) => {
            return { id: obj.Id, title: obj.Title };
          })
        )
      );
  }

  if (community_news_response.ok) {
    const news = ((await community_news_response.json()) as News[]).reverse();

    const saved_news = (await Bun.file(".runtime/community.json").json()) as {
      id: string;
      title: string;
    }[];

    for (const post of news) {
      if (
        saved_news.find((obj) => obj.id === post.Id) == undefined &&
        Date.now() - new Date(post.Created).getTime() < 1_209_600_000
      ) {
        new_community_posts.push(post);
      }
    }

    if (new_community_posts.length > 0)
      Bun.write(
        ".runtime/community.json",
        JSON.stringify(
          news.map((obj) => {
            return { id: obj.Id, title: obj.Title };
          })
        )
      );
  }

  if (new_platform_posts.length == 0 && new_community_posts.length == 0) return;

  await session.login({
    identifier: Bun.env.ID!,
    password: Bun.env.PASSWORD!,
  });
  const agent = new Agent(session);

  for (const post of new_community_posts) {
    let blob_data: OutputSchema | null = null;

    try {
      const imgBlob = await createThumbnailBlob(post.Media);

      if (imgBlob) {
        blob_data = (await agent.uploadBlob(imgBlob)).data;
      }
    } catch (error) {
      console.error([
        "Failed to generate a thumbnail, skipping for now...",
        error,
      ]);
    }

    const org_ident = post.Package!.split(".")[0];
    const org_bsky = known_orgs.find((author) => author.key === org_ident);

    const package_data = await (
      await fetch(
        `https://services.facepunch.com/sbox/package/find?q=${post.Package}`
      )
    ).json();
    const org_name: string = package_data.Packages[0].Org.Title;
    const package_title: string = package_data.Packages[0].Title;

    let text =
      "New community news post has been released for " + package_title + " by ";
    text += org_bsky != undefined ? "@" + org_bsky.value : org_name;
    text += "\n#s&box #sbox #s&boxCommunityNews";

    const rt = new RichText({
      text: text,
    });
    await rt.detectFacets(agent);
    await agent.post({
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: base_url + post.Url,
          title: post.Title,
          description: post.Summary,
          thumb: blob_data ? blob_data.blob : undefined,
        },
      },
    });
  }

  for (const post of new_platform_posts) {
    let blob_data: OutputSchema | null = null;

    try {
      const imgBlob = await createThumbnailBlob(post.Media);

      if (imgBlob) {
        blob_data = (await agent.uploadBlob(imgBlob)).data;
      }
    } catch (error) {
      console.error([
        "Failed to generate a thumbnail, skipping for now...",
        error,
      ]);
    }

    const rt = new RichText({
      text: "New platform news post has been released\n#s&box #sbox #s&boxPlatformNews",
    });
    await rt.detectFacets(agent);
    await agent.post({
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: base_url + post.Url,
          title: post.Title,
          description: post.Summary,
          thumb: blob_data ? blob_data.blob : undefined,
        },
      },
    });
  }

  await session.logout();
}

async function createThumbnailBlob(media?: string) {
  if (!media) return null;

  if (media.endsWith(".mp4")) {
    const metadata =
      await $`ffprobe -v quiet -print_format json -show_format ${media}`.json();

    const halfTime = metadata.format.duration / 2;

    const data =
      await $`ffmpeg -i ${media} -ss ${halfTime} -frames:v 1 -f webp -compression_level 5 -quality 70 -preset picture -`.blob();

    return data;
  }

  const thumb = await (await fetch(media)).arrayBuffer();

  //max thumb size is 976.56KB
  const compressed_buffer = await sharp(thumb)
    .webp({ preset: "picture", quality: 70, effort: 5 })
    .toBuffer();

  return new Blob([compressed_buffer]);
}

const scheduleExpression = "0 * * * *"; // Run once every hour
const job = new CronJob(scheduleExpression, run);

job.start();
