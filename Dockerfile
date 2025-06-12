FROM oven/bun:alpine
WORKDIR /usr/src/app

RUN apk add ffmpeg

COPY index.ts index.ts
COPY news.ts news.ts
COPY package.json package.json
COPY bun.lockb bun.lockb

RUN bun install --frozen-lockfile

ENTRYPOINT [ "bun", "run", "index.ts" ]
