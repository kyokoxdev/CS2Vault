<div align="center">

# CS2Vault

**Counter-Strike 2 市场情报与饰品价格分析仪表板**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.3-blue?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.4.1-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

追踪市场价格、管理您的库存资产，并获取基于 AI 的 Counter-Strike 2 饰品市场情报。

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[功能特性](#功能特性) · [快速开始](#快速开始) · [数据同步机制](#数据同步机制) · [常用脚本](#常用脚本) · [项目部署](#项目部署) · [许可证](#许可证)

</div>

---

## 功能特性

| 功能 | 描述 |
|---------|-------------|
| **市场概览** | 通过 CSFloat、Pricempire 和 Steam 社区市场 API 进行实时价格追踪。 |
| **投资组合管理** | 管理您的 CS2 库存，实时追踪资产总估值、历史购入/售出价格及利润率。 |
| **涨跌幅榜单** | 快速筛选出市场中短期及长期内价格涨幅和跌幅最大的热门饰品。 |
| **Aegis AI 助手** | 集成 Google Gemini、OpenAI GPT、Anthropic Claude、OpenRouter 和 9Router 网关，提供智能饰品市场分析与对话。 |
| **新闻动态** | 通过 RSS 订阅聚合展示最新的 CS2 社区生态与交易市场资讯。 |
| **饰品图表分析** | 使用 TradingView Lightweight Charts 绘制带有常用技术指标的 K 线图。 |
| **响应式界面** | 基于 CSS Modules 编写，完美适配桌面、平板和移动端设备。 |

---

## 技术栈

- **框架**: Next.js 16.1.6 (App Router, React Compiler)
- **前端与样式**: React 19.2.3, CSS Modules (设计标记配置于 `src/app/globals.css`)
- **数据库与 ORM**: 本地开发 SQLite / 生产环境 Turso (libSQL)，使用 Prisma 7.4.1 (客户端代码自动生成至 `src/generated/prisma`)
- **身份验证**: NextAuth.js (Steam OpenID 登录)
- **图表**: TradingView Lightweight Charts 和 `lightweight-charts-indicators`
- **AI 模型集成**: Gemini、OpenAI、Anthropic 原生 SDK，以及 OpenRouter 与 9Router 兼容网关

---

## 快速开始

### 前提条件

- Node.js 20+
- npm、pnpm 或 yarn

### 本地安装与运行

```bash
# 克隆仓库
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# 安装项目依赖
npm install

# 复制环境变量模板文件并填写您的配置
cp .env.example .env.local

# 生成 Prisma 客户端
npx prisma generate

# 初始化本地 SQLite 数据库结构
npx prisma db push

# 导入默认配置和初始数据
npx tsx prisma/seed.ts

# 启动本地开发服务器
npm run dev
```

启动后，可在浏览器中访问 [http://localhost:3000](http://localhost:3000) 查看应用。

---

## 环境变量

本地开发时，应用会自动读取 `.env.local` 文件的配置。

| 环境变量 | 是否必需 | 说明 |
|----------|----------|-------------|
| `DATABASE_URL` | 是 | 本地 SQLite 文件的路径 (默认: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | 生产环境 | Turso 数据库 URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | 生产环境 | Turso 数据库认证令牌 |
| `CRON_SECRET` | 生产环境 | 保护后台 Cron 路由的安全秘钥 |
| `STEAM_API_KEY` | 是 | [Steam Web API 秘钥](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | 是 | 允许登录该系统后台的 Steam64 ID |
| `CSFLOAT_API_KEY` | 是 | [CSFloat 平台 API 秘钥](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | 否 | [Pricempire 平台 API 秘钥](https://pricempire.com/) |
| `GEMINI_API_KEY` | 否 | [Google AI Studio 接口秘钥](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | 否 | [OpenAI 接口秘钥](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | 否 | 覆盖默认的 OpenAI 模型 (默认: `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | 否 | [Anthropic 接口秘钥](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_MODEL` | 否 | 覆盖默认的 Anthropic 模型 (默认: `claude-opus-4-7`) |
| `OPENROUTER_API_KEY` | 否 | [OpenRouter 接口秘钥](https://openrouter.ai/settings/keys) |
| `OPENROUTER_BASE_URL` | 否 | OpenRouter 接口地址 (默认: `https://openrouter.ai/api/v1`) |
| `OPENROUTER_MODEL` | 否 | 覆盖默认的 OpenRouter 模型 (默认: `~openai/gpt-latest`) |
| `NINEROUTER_API_KEY` | 否 | 9Router 网关密钥 |
| `NINEROUTER_BASE_URL` | 否 | 9Router 网关接口地址 (默认: `http://localhost:20128/v1`) |
| `NINEROUTER_MODEL` | 否 | 覆盖默认的 9Router 模型 (默认: `cc/claude-opus-4-7`) |
| `GOOGLE_CLIENT_ID` | 否 | Google OAuth 客户端 ID (用于 Gemini OAuth 流程) |
| `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth 客户端密钥 |
| `NEXTAUTH_SECRET` | 是 | 用于会话加密的密钥 (可使用 `openssl rand -hex 32` 生成) |
| `NEXTAUTH_URL` | 是 | 应用基础 URL (默认: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | 是 | 用于加密存储在数据库中第三方凭据的对称密钥 |

---

## 数据同步机制

数据刷新工作由服务器端定时器与客户端页面生命周期共同维护：

1. **Vercel 定时任务** (配置于 `vercel.json`):
   - `GET /api/sync`: 每日执行 (`0 4 * * *`)，用于同步常规市场价格数据。
   - `GET /api/market/market-cap-sync`: 每日执行 (`0 8 * * *`)，用于重新计算加权市场份额与市值。
2. **外部定时服务** (如 cron-job.org):
   - `GET /api/intelligence/run`: 该任务已从 `vercel.json` 移除，需在外部定时任务服务中配置，并携带包含 `CRON_SECRET` 校验的请求头，设定为每 5 分钟执行一次。此任务处理由 CSFloat 收集的饰品并用 Steam 社区市场 (SCM) API 进行验证。为防范 SCM 封禁，每次运行最多只执行 3 次验证，且严格执行每分钟 19 次、每日 950 次的 SCM 速率安全上限。
3. **客户端自动刷新**:
   - 当浏览器标签页处于活跃状态时，系统会基于数据库中配置的 `priceRefreshIntervalMin` 间隔时间，在后台自动刷新首页、自选列表和投资组合数据。
   - 用户亦可在“设置”面板手动点击“Refresh Market Cap”触发即时重算。

---

## 常用脚本

您可以使用以下 `npm` 命令来运行或管理应用：

| 脚本命令 | 描述 |
|--------|-------------|
| `npm run dev` | 启动本地 Next.js 热重载开发服务器。 |
| `npm run build` | 生成 Prisma 客户端，执行数据库 Schema 同步及数据初始化，并构建 Next.js 生产环境版本。 |
| `npm run start` | 运行已构建完成的 Next.js 生产环境服务器。 |
| `npm run lint` | 执行 ESLint 语法和代码规范检查。 |
| `npm run test` | 运行 Vitest 单元与集成测试。 |
| `npm run test:watch` | 以交互式监听模式运行 Vitest 单元测试。 |
| `npm run db:push:turso` | 向生产环境 Turso 数据库同步 Schema 并导入初始化数据。 |
| `npm run db:migrate` | 使用本地 SQLite 创建并应用一个新的数据库迁移。 |
| `npm run db:studio` | 打开 Prisma Studio 本地可视化数据库管理界面。 |

---

## 项目部署

### 生产环境: Vercel + Turso

本系统线上部署推荐使用 Turso 数据库，这是一款基于 HTTP 提供 SQLite 连接服务的托管平台。

1. **创建 Turso 数据库**:
   ```bash
   # 安装 Turso 客户端
   curl -sSfL https://get.tur.so/install.sh | bash

   # 创建数据库实例
   turso db create cs2vault

   # 获取数据库连接地址和授权令牌
   turso db show cs2vault --url
   turso db tokens create cs2vault
   ```
2. **同步 Schema 至 Turso**:
   在本地 `.env.local` 文件中填入 `TURSO_DATABASE_URL` 与 `TURSO_AUTH_TOKEN`，然后运行：
   ```bash
   npm run db:push:turso
   ```
3. **配置 Vercel 部署**:
   - 将 GitHub 仓库导入至 Vercel。
   - 在 Vercel 的项目设置 (Settings) 中配置所有环境变量。
   - 设置 Next.js 的 Build Command 覆盖为：
     ```bash
     prisma generate && npx tsx prisma/push-schema.ts && next build
     ```
   - 点击部署即可完成上线。

*注意：如果构建阶段出现内存不足 (OOM) 报错，请在构建命令前加设：`NODE_OPTIONS=--max-old-space-size=4096`*

---

## 许可证

GPL v3
