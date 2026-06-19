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
| **Aegis チャット** | Gemini、OpenAI、Anthropic、OpenRouter、9Router を使う Aegis 搭載チャット |
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
- **AI**: Google Gemini、OpenAI GPT、Anthropic Claude、OpenRouter、9Router
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
| `OPENAI_MODEL` | いいえ | OpenAI モデル上書き（デフォルト: `gpt-4o-mini`） |
| `ANTHROPIC_API_KEY` | いいえ | [Anthropic API キー](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_MODEL` | いいえ | Anthropic モデル上書き（デフォルト: `claude-opus-4-7`） |
| `OPENROUTER_API_KEY` | いいえ | [OpenRouter API キー](https://openrouter.ai/settings/keys) |
| `OPENROUTER_BASE_URL` | いいえ | OpenRouter 互換ベース URL（デフォルト: `https://openrouter.ai/api/v1`） |
| `OPENROUTER_MODEL` | いいえ | OpenRouter モデル上書き（デフォルト: `~openai/gpt-latest`） |
| `NINEROUTER_API_KEY` | いいえ | ローカル認証を有効にした 9Router ゲートウェイ用の任意キー |
| `NINEROUTER_BASE_URL` | いいえ | 9Router OpenAI 互換ゲートウェイ URL（デフォルト: `http://localhost:20128/v1`） |
| `NINEROUTER_MODEL` | いいえ | 9Router モデル上書き（デフォルト: `cc/claude-opus-4-7`） |
| `GOOGLE_CLIENT_ID` | いいえ | Google OAuth クライアント ID（Gemini OAuth フロー用） |
| `GOOGLE_CLIENT_SECRET` | いいえ | Google OAuth クライアントシークレット |
| `NEXTAUTH_SECRET` | はい | `openssl rand -hex 32` で生成 |
| `NEXTAUTH_URL` | はい | アプリ URL（デフォルト: `http://localhost:3000`） |
| `TOKEN_ENCRYPTION_KEY` | はい | 保存トークンの暗号化キー |

</details>

### データ更新モデル

- **サーバーバックグラウンド同期**: `vercel.json` は日次マーケット同期、日次時価総額同期、5 分ごとの `GET /api/intelligence/run` チェックを設定し、1 回あたりの SCM 検証を 3 件に制限します。
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

`vercel.json` は日次 `GET /api/sync`（`0 4 * * *`）、日次 `GET /api/market/market-cap-sync`（`0 8 * * *`）、5 分ごとの `GET /api/intelligence/run`（`*/5 * * * *`）cron ジョブを設定します。cron 認証リクエストでは、インテリジェンス runner は 1 回あたり 3 件の SCM 検証に抑え、19/分と 950/日の安全上限を適用します。Vercel で `CRON_SECRET` を設定して、cron リクエストが認証されるようにしてください。

Vercel プランが 5 分 cron をサポートしない場合は、同じ `CRON_SECRET` を使って外部スケジューラから `/api/intelligence/run` を呼び出してください。開いているセッションは引き続き `ブラウザリフレッシュ間隔（分）` によりクライアント側で市場データを更新し、設定ページからオンデマンドで時価総額リフレッシュを強制できます。

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
