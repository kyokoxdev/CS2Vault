<div align="center">

# CS2Vault

**Counter-Strike 2 市場インテリジェンスダッシュボード**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

価格を追跡し、インベントリを管理し、AI 搭載の市場インサイトを入手。

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[機能](#機能) · [はじめに](#はじめに) · [デプロイ](#デプロイ) · [ライセンス](#ライセンス)

</div>

---

## 機能

| 機能 | 説明 |
|------|------|
| **マーケット概要** | CSFloat、Pricempire、Steam をデータソースとしたリアルタイム価格追跡 |
| **ポートフォリオ管理** | CS2 インベントリ価値と履歴価格データの追跡 |
| **トップムーバーズ** | 価値が上昇または下落しているアイテムを確認 |
| **AI チャット** | Google Gemini と OpenAI による市場分析 |
| **ニュースフィード** | RSS 経由の CS2 市場ニュースまとめ |
| **アイテム詳細** | TradingView Lightweight Charts によるローソク足価格チャート |
| **レスポンシブ UI** | デスクトップ、タブレット、モバイルに対応 |

## 技術スタック

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

- **フレームワーク**: [Next.js 16](https://nextjs.org)（App Router、React Compiler）
- **データベース**: [Prisma](https://prisma.io) + [Turso](https://turso.tech/)（libSQL）経由の SQLite
- **認証**: [NextAuth.js](https://next-auth.js.org)（Steam OpenID）
- **チャート**: [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- **AI**: Google Gemini、OpenAI GPT
- **スタイリング**: CSS Modules（ダークテーマ、追加テーマ予定）

## はじめに

### 前提条件

- Node.js 20+
- npm / pnpm / yarn

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# 依存関係をインストール
npm install

# 環境変数テンプレートをコピーしてキーを入力
cp .env.example .env.local

# Prisma クライアントを生成し、ローカルデータベースを作成
npx prisma generate
npx prisma db push

# デフォルト設定をシード
npx tsx prisma/seed.ts

# 開発サーバーを起動
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

### 環境変数

<details>
<summary>環境変数テーブルを展開</summary>

| 変数 | 必須 | 説明 |
|------|------|------|
| `DATABASE_URL` | はい | ローカル開発用 SQLite パス（デフォルト: `file:./dev.db`） |
| `TURSO_DATABASE_URL` | Vercel | Turso データベース URL（`libsql://...`） |
| `TURSO_AUTH_TOKEN` | Vercel | Turso 認証トークン |
| `CRON_SECRET` | Vercel | Vercel Cron ジョブ認証用シークレット |
| `STEAM_API_KEY` | はい | [Steam Web API キー](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | はい | 認証用 Steam64 ID |
| `CSFLOAT_API_KEY` | はい | [CSFloat API キー](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | いいえ | [Pricempire API キー](https://pricempire.com/) |
| `GEMINI_API_KEY` | いいえ | [Google AI Studio キー](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | いいえ | [OpenAI API キー](https://platform.openai.com/api-keys) |
| `GOOGLE_CLIENT_ID` | いいえ | Google OAuth クライアント ID（Gemini OAuth フロー用） |
| `GOOGLE_CLIENT_SECRET` | いいえ | Google OAuth クライアントシークレット |
| `NEXTAUTH_SECRET` | はい | `openssl rand -hex 32` で生成 |
| `NEXTAUTH_URL` | はい | アプリ URL（デフォルト: `http://localhost:3000`） |
| `TOKEN_ENCRYPTION_KEY` | はい | 保存トークンの暗号化キー |

</details>

### データ更新モデル

- **サーバーバックグラウンド同期**: Vercel Hobby の cron は `vercel.json` で設定された日次 `GET /api/sync` ジョブに制限されます。
- **ブラウザタブ更新**: アプリは保存された `priceRefreshIntervalMin` 設定を使用して、ブラウザ開放中にホームページ、ウォッチリスト、ポートフォリオの市場データを更新します。
- **手動時価総額リフレッシュ**: 設定に `時価総額をリフレッシュ` アクションが追加され、即座に新しい加重計算を強制実行できます。

### スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | プロダクションビルド |
| `npm run start` | プロダクションサーバーを起動 |
| `npm run lint` | ESLint を実行 |
| `npm run test` | Vitest テストを実行 |
| `npm run db:push:turso` | スキーマ + シードを Turso にプッシュ |

## デプロイ

### Vercel + Turso

このアプリは Vercel デプロイ用のクラウドデータベースとして [Turso](https://turso.tech/) を使用します。

<details>
<summary><strong>1. Turso のセットアップ</strong></summary>

```bash
# Turso CLI をインストール
curl -sSfL https://get.tur.so/install.sh | bash

# データベースを作成
turso db create cs2vault

# 認証情報を取得
turso db show cs2vault --url
turso db tokens create cs2vault
```

</details>

<details>
<summary><strong>2. スキーマを Turso にプッシュ</strong></summary>

```bash
# .env.local に認証情報を設定後:
npm run db:push:turso
```

</details>

<details>
<summary><strong>3. Vercel にデプロイ</strong></summary>

1. [vercel.com/new](https://vercel.com/new) で GitHub リポジトリをインポート
2. Vercel ダッシュボードで `.env.example` の全環境変数を追加
3. ビルドコマンドオーバーライドを設定: `npx prisma generate && next build`
4. デプロイ

</details>

<details>
<summary><strong>4. Cron とリフレッシュ動作</strong></summary>

`vercel.json` は 1 日 1 回 `GET /api/sync` を実行する cron ジョブ（`0 0 * * *`）を設定します。cron 認証リクエストでは、このエンドポイントは通常の同期パイプラインと時価総額再計算（古いデータの場合）の両方を実行します。Vercel で `CRON_SECRET` を設定して、cron リクエストが認証されるようにしてください。

Vercel Hobby デプロイでは、この日次 cron が唯一のサーバーサイドスケジューラです。より頻繁な更新を取得するには、設定で `ブラウザリフレッシュ間隔（分）` を設定してください（例: `15`）。開いているセッションは 15 分ごとにクライアント側で市場データを更新し、設定ページからオンデマンドで時価総額リフレッシュを強制できます。

</details>

### ローカル開発

ローカル開発では、アプリはローカル SQLite ファイル（`dev.db`）を自動的に使用します — Turso は不要です。

### ビルド設定

ビルド中に OOM エラーが発生する場合:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

---

<div align="center">

## ライセンス

GPL v3

</div>