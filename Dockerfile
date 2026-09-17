# syntax=docker/dockerfile:1

# ---- 依赖层：按 lockfile 严格安装 ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 构建层：类型检查 + 产出静态资源 ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- web：nginx 托管单页应用 ----
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ---- verify：一次性校验服务（Vitest + Playwright）----
# 基础镜像自带 Chromium 及系统依赖，版本与 @playwright/test 对齐。
FROM mcr.microsoft.com/playwright:v1.47.2-jammy AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "verify"]
