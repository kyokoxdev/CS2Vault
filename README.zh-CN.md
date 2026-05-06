<div align="center">

# CS2Vault

**Counter-Strike 2 市场智能仪表板**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

追踪价格、管理库存、获取 AI 驱动的市场洞察。

**[English](./README.md)** · **中文**

[功能](#功能) · [快速开始](#快速开始) · [部署](#部署) · [许可证](#许可证)

</div>

---

## 功能

| 功能 | 描述 |
|------|------|
| **市场概览** | 使用 CSFloat、Pricempire 和 Steam 作为数据源的实时价格追踪 |
| **库存管理** | 追踪你的 CS2 库存价值和历史价格数据 |
| **涨跌排行** | 查看哪些物品正在升值或贬值 |
| **AI 对话** | 由 Google Gemini 和 OpenAI 驱动的市场分析 |
| **新闻动态** | 通过 RSS 汇总 CS2 市场新闻 |
| **物品详情** | 使用 TradingView Lightweight Charts 的 K 线图 |
| **响应式界面** | 支持桌面、平板和移动端 |

## 技术栈

<table>
<tr>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=nextjs" width="48" height="48" alt="Next.js" />
<br>Next.js 16
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=ts" width="48" height="48" alt="TypeScript" />
<br>TypeScript
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=prisma" width="48" height="48" alt="Prisma" />
<br>Prisma
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=sqlite" width="48" height="48" alt="SQLite" />
<br>SQLite/Turso
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=css" width="48" height="48" alt="CSS" />
<br>CSS Modules
</td>
</tr>
</table>

- **框架**: [Next.js 16](https://nextjs.org)（App Router、React Compiler）
- **数据库**: 通过 [Prisma](https://prisma.io) + [Turso](https://turso.tech/)（libSQL）使用 SQLite
- **认证**: [NextAuth.js](https://next-auth.js.org)（Steam OpenID）
- **图表**: [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- **AI**: Google Gemini、OpenAI GPT
- **样式**: CSS Modules（暗色主题，更多主题规划中）

## 快速开始

### 前提条件

- Node.js 20+
- npm / pnpm / yarn

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# 安装依赖
npm install

# 复制环境变量模板并填写你的密钥
cp .env.example .env.local

# 生成 Prisma 客户端并创建本地数据库
npx prisma generate
npx prisma db push

# 填充默认设置
npx tsx prisma/seed.ts

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 环境变量

<details>
<summary>点击展开环境变量表</summary>

| 变量 | 必需 | 描述 |
|------|------|------|
| `DATABASE_URL` | 是 | 本地开发 SQLite 路径（默认: `file:./dev.db`） |
| `TURSO_DATABASE_URL` | Vercel | Turso 数据库 URL（`libsql://...`） |
| `TURSO_AUTH_TOKEN` | Vercel | Turso 认证令牌 |
| `CRON_SECRET` | Vercel | Vercel Cron 任务认证密钥 |
| `STEAM_API_KEY` | 是 | [Steam Web API 密钥](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | 是 | 你的 Steam64 ID，用于认证 |
| `CSFLOAT_API_KEY` | 是 | [CSFloat API 密钥](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | 否 | [Pricempire API 密钥](https://pricempire.com/) |
| `GEMINI_API_KEY` | 否 | [Google AI Studio 密钥](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | 否 | [OpenAI API 密钥](https://platform.openai.com/api-keys) |
| `GOOGLE_CLIENT_ID` | 否 | Google OAuth 客户端 ID（用于 Gemini OAuth 流程） |
| `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth 客户端密钥 |
| `NEXTAUTH_SECRET` | 是 | 使用 `openssl rand -hex 32` 生成 |
| `NEXTAUTH_URL` | 是 | 应用 URL（默认: `http://localhost:3000`） |
| `TOKEN_ENCRYPTION_KEY` | 是 | 用于加密存储令牌的密钥 |

</details>

### 数据刷新机制

- **服务器后台同步**: Vercel Hobby 的 cron 任务限制为每天一次 `GET /api/sync`，在 `vercel.json` 中配置。
- **开标签页刷新**: 应用使用保存的 `priceRefreshIntervalMin` 设置，在浏览器打开时刷新首页、关注列表和投资组合的市场数据。
- **手动刷新市值**: 设置页面现在包含 `刷新市值` 操作，可立即强制重新计算。

### 常用命令

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run test` | 运行 Vitest 测试 |
| `npm run db:push:turso` | 推送数据库 schema 并填充数据到 Turso |

## 部署

### Vercel + Turso

本应用使用 [Turso](https://turso.tech/) 作为 Vercel 部署的云数据库。

<details>
<summary><strong>1. 配置 Turso</strong></summary>

```bash
# 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 创建数据库
turso db create cs2vault

# 获取认证凭据
turso db show cs2vault --url
turso db tokens create cs2vault
```

</details>

<details>
<summary><strong>2. 推送 Schema 到 Turso</strong></summary>

```bash
# 在 .env.local 中设置认证凭据，然后：
npm run db:push:turso
```

</details>

<details>
<summary><strong>3. 部署到 Vercel</strong></summary>

1. 在 [vercel.com/new](https://vercel.com/new) 导入 GitHub 仓库
2. 在 Vercel 控制面板中添加 `.env.example` 中的所有环境变量
3. 设置构建命令覆盖: `npx prisma generate && next build`
4. 部署

</details>

<details>
<summary><strong>4. Cron 任务和刷新行为</strong></summary>

`vercel.json` 配置了每天执行一次 `GET /api/sync` 的 cron 任务（`0 0 * * *`）。在 cron 认证请求时，此端点会运行常规同步流程和市值重新计算（当数据过期时）。在 Vercel 中设置 `CRON_SECRET` 以确保 cron 请求被授权。

对于 Vercel Hobby 部署，此每日 cron 任务是唯一的服务端调度器。要获取更频繁的更新，请在设置中配置 `浏览器刷新间隔（分钟）`（例如 `15`）。打开的会话将每 15 分钟在客户端刷新市场数据，你也可以使用设置页面按需强制刷新市值。

</details>

### 本地开发

本地开发时，应用自动使用本地 SQLite 文件（`dev.db`）——无需 Turso。

### 构建配置

如果构建时遇到内存不足错误:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

---

<div align="center">

## 许可证

GPL v3

</div>
