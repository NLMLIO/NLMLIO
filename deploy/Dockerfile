# 외부 공개용 이미지. compose.tunnel.yaml이 target별로 빌드한다.
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
COPY . .
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN pnpm install --frozen-lockfile && pnpm build

# NestJS 서버와 마이그레이션(prisma CLI는 devDependency라 전체 의존성을 둔다)
FROM build AS app
ENV NODE_ENV=production
WORKDIR /app/server
CMD ["node", "dist/main"]

# React 정적 파일 + /api, /socket.io 프록시
FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
