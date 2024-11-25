import { Agent, CredentialSession, RichText } from "@atproto/api";
import type { News } from "./news";
import sharp from "sharp";
import type { OutputSchema } from "@atproto/api/dist/client/types/com/atproto/repo/uploadBlob";
import { CronJob } from "cron";

const base_url = "https://sbox.game";
const session = new CredentialSession(new URL("https://bsky.social"));

const known_orgs: { key: string; value: string }[] = [
  { key: "apetavern", value: "apetavern.com" },
  { key: "smallfish", value: "smallfi.sh" },
  { key: "carsonk", value: "carsonk.net" },
  { key: "katewoz", value: "k8woz.bsky.social" },
  { key: "nolankicks", value: "kicks13.bsky.social" },
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

    const saved_news = (await Bun.file("platform.json").json()) as {
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
        "platform.json",
        JSON.stringify(
          news.map((obj) => {
            return { id: obj.Id, title: obj.Title };
          })
        )
      );
  }

  if (community_news_response.ok) {
    const news = ((await community_news_response.json()) as News[]).reverse();

    const saved_news = (await Bun.file("community.json").json()) as {
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
        "community.json",
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
    if (post.Media) {
      const thumb = await (await fetch(post.Media)).arrayBuffer();

      //max thumb size is 976.56KB
      const compressed_buffer = await sharp(thumb)
        .webp({ preset: "picture", quality: 70, effort: 5 })
        .toBuffer();

      blob_data = (await agent.uploadBlob(new Blob([compressed_buffer]))).data;
    }

    const org_ident = post.Package!.split(".")[0];
    const org_bsky = known_orgs.find((author) => author.key === org_ident);

    let text = "New community news post has been released";
    if (org_bsky != undefined) text += " by @" + org_bsky.value;
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
    if (post.Media) {
      const thumb = await (await fetch(post.Media)).arrayBuffer();

      //max thumb size is 976.56KB
      const compressed_buffer = await sharp(thumb)
        .webp({ preset: "picture", quality: 70, effort: 5 })
        .toBuffer();

      blob_data = (await agent.uploadBlob(new Blob([compressed_buffer]))).data;
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

const scheduleExpression = "0 * * * *"; // Run once every hour
const job = new CronJob(scheduleExpression, run);

job.start();
