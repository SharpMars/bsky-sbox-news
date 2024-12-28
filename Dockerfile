FROM oven/bun AS build
WORKDIR /usr/src/app

COPY index.ts index.ts
COPY news.ts news.ts
COPY package.json package.json
COPY bun.lockb bun.lockb

RUN bun install --frozen-lockfile
RUN bun build index.ts --target=bun --outdir ./build

FROM oven/bun:alpine AS final
WORKDIR /usr/src/app

COPY --from=build /usr/src/app/build/index.js index.js

ENTRYPOINT [ "bun", "run", "index.js" ]