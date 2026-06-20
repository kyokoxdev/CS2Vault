<div align="center">

# CS2Vault

**Counter-Strike 2 市場データ分析＆ポートフォリオ管理ダッシュボード**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.3-blue?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.4.1-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

市場価格の追跡、ゲーム内インベントリの資産管理、およびAIを活用したCounter-Strike 2の市場分析データを提供します。

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[主な機能](#主な機能) · [はじめに](#はじめに) · [データ同期システム](#データ同期システム) · [利用可能なコマンド](#利用可能なコマンド) · [デプロイ手順](#デプロイ手順) · [ライセンス](#ライセンス)

</div>

---

## 主な機能

| 機能 | 説明 |
|---------|-------------|
| **市場データ概要** | CSFloat、Pricempire、およびSteamコミュニティマーケットのAPIを統合したリアルタイムの価格追跡。 |
| **ポートフォリオ管理** | 自身のCS2インベントリを登録し、資産総額の推移、アイテムの取得・売却額、利益率を可視化。 |
| **価格変動ランキング** | 短期および長期的なスパンで価格が急上昇または急下落しているアイテムを抽出して表示。 |
| **Aegis AIアシスタント** | Google Gemini、OpenAI GPT、Anthropic Claude、OpenRouter、9Routerゲートウェイと連携した市場分析チャット。 |
| **ニュースフィード** | RSS経由でCounter-Strikeの取引市場やコミュニティ内の最新動向を集約。 |
| **詳細な価格チャート** | TradingView Lightweight Chartsおよび主要テクニカル指標を使用したローソク足チャートの表示。 |
| **レスポンシブUI** | CSS Modulesを採用し、PC、タブレット、スマートフォンなどの各端末に最適化された画面表示。 |

---

## 技術スタック

- **フレームワーク**: Next.js 16.1.6 (App Router, React Compiler)
- **UI & スタイリング**: React 19.2.3, CSS Modules (設計トークンは `src/app/globals.css` に定義)
- **データベース & ORM**: SQLite (ローカル開発環境) / Turso (本番環境, libSQL)。Prisma 7.4.1で制御 (クライアント出力先: `src/generated/prisma`)
- **認証**: NextAuth.js (Steam OpenID ログイン)
- **チャート**: TradingView Lightweight Charts & `lightweight-charts-indicators`
- **AI連携**: Gemini, OpenAI, Anthropic などの各種SDK、OpenRouter / 9Routerなどのプロキシゲートウェイ

---

## はじめに

### 前提条件

- Node.js 20+
- npm、pnpm、またはyarn

### ローカルでのセットアップ方法

```bash
# リポジトリのクローン
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# 依存パッケージのインストール
npm install

# 環境変数ファイルのコピーおよび編集
cp .env.example .env.local

# Prismaクライアントコードの生成
npx prisma generate

# ローカル用のSQLiteデータベーススキーマを反映
npx prisma db push

# 初期設定およびマスターデータの書き込み
npx tsx prisma/seed.ts

# 開発サーバーの起動
npm run dev
```

起動後、ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスしてください。

---

## 環境変数

ローカル環境では、`.env.local` ファイルを作成して以下の環境変数を設定します。

| 変数名 | 必須区分 | 設定値の説明 |
|----------|----------|-------------|
| `DATABASE_URL` | はい | ローカルSQLiteファイルのパス (デフォルト: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | 本番環境 | TursoデータベースURL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | 本番環境 | Tursoデータベース接続用トークン |
| `CRON_SECRET` | 本番環境 | 定期バッチ実行のアクセス認証用シークレット |
| `STEAM_API_KEY` | はい | [Steam Web API キー](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | はい | ログインを許可するユーザーのSteam64 ID |
| `CSFLOAT_API_KEY` | はい | [CSFloat API キー](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | いいえ | [Pricempire API キー](https://pricempire.com/) |
| `GEMINI_API_KEY` | いいえ | [Google AI Studio API キー](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | いいえ | [OpenAI API キー](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | いいえ | 使用するOpenAIモデルの指定 (デフォルト: `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | いいえ | [Anthropic Console API キー](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_MODEL` | いいえ | 使用するAnthropicモデルの指定 (デフォルト: `claude-opus-4-7`) |
| `OPENROUTER_API_KEY` | いいえ | [OpenRouter API キー](https://openrouter.ai/settings/keys) |
| `OPENROUTER_BASE_URL` | いいえ | OpenRouterの接続ベースURL (デフォルト: `https://openrouter.ai/api/v1`) |
| `OPENROUTER_MODEL` | いいえ | 使用するOpenRouterモデルの指定 (デフォルト: `~openai/gpt-latest`) |
| `NINEROUTER_API_KEY` | いいえ | 9Router接続用キー |
| `NINEROUTER_BASE_URL` | いいえ | 9Router接続ベースURL (デフォルト: `http://localhost:20128/v1`) |
| `NINEROUTER_MODEL` | いいえ | 使用する9Routerモデルの指定 (デフォルト: `cc/claude-opus-4-7`) |
| `GOOGLE_CLIENT_ID` | いいえ | Google OAuth クライアントID (Geminiへのユーザー認証用) |
| `GOOGLE_CLIENT_SECRET` | いいえ | Google OAuth クライアントシークレット |
| `NEXTAUTH_SECRET` | はい | セッション暗号化用キー (生成例: `openssl rand -hex 32`) |
| `NEXTAUTH_URL` | はい | アプリ起動ホストURL (デフォルト: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | はい | DBに保存する外部APIクレデンシャル等の暗号化キー |

---

## データ同期システム

データの更新処理は、サーバーサイドバッチとクライアントサイドでの自動トリガーに分かれています。

1. **Vercel Cron** (`vercel.json` に設定):
   - `GET /api/sync`: 毎日1回 (`0 4 * * *`) 実行。主要な市場価格を同期します。
   - `GET /api/market/market-cap-sync`: 毎日1回 (`0 8 * * *`) 実行。市場の時価総額割合を再計算します。
2. **外部スケジューラー** (例: cron-job.orgなど):
   - `GET /api/intelligence/run`: 本タスクは `vercel.json` から除外されているため、外部のCronサービスで5分間隔で呼び出す必要があります (ヘッダーに `CRON_SECRET` を設定して認証を行います)。本処理では、CSFloatで検知したリストのSteamマーケット(SCM)による検証を行います。Steam側のアクセス規制を避けるため、1回あたりの検証数を最大3件に抑え、且つ「毎分19リクエスト、毎日950リクエスト」の安全範囲を超えないよう流量制御を行っています。
3. **ブラウザ側での自動更新**:
   - ダッシュボードがブラウザで開かれている間、DBの設定値 `priceRefreshIntervalMin` に基づいて自動的にウォッチリストやポートフォリオ価格を最新化します。
   - 設定画面の「Refresh Market Cap」ボタンをクリックすることで、手動で即座に再計算を実行可能です。

---

## 利用可能なコマンド

管理および検証用の `npm` スクリプト一覧です。

| コマンド | 処理概要 |
|--------|-------------|
| `npm run dev` | Next.jsの開発用ホットリロードサーバーを起動。 |
| `npm run build` | Prismaのモデルをビルドし、データベース構造の同期と初期化を実行後、Next.jsのプロダクションビルドを作成。 |
| `npm run start` | Next.jsの本番稼働用サーバーを起動。 |
| `npm run lint` | ESLintによるコード構文チェックを実行。 |
| `npm run test` | Vitestを用いた単体テストおよび統合テストを一度実行。 |
| `npm run test:watch` | Vitestテストを対話型のウォッチモードで実行。 |
| `npm run db:push:turso` | 本番用のTursoデータベースにスキーマを反映し、初期マスタをインポート。 |
| `npm run db:migrate` | ローカルSQLiteで新規DB移行ファイルの作成および適用を実行。 |
| `npm run db:studio` | Prisma StudioのブラウザGUIを起動してデータベースデータを表示。 |

---

## デプロイ手順

### 本番環境: Vercel + Turso

本プロジェクトは、サーバーレス環境向けに設計されたHTTPベースの分散SQLiteサービスであるTursoを採用しています。

1. **Turso データベースのセットアップ**:
   ```bash
   # Turso CLIのインストール
   curl -sSfL https://get.tur.so/install.sh | bash

   # データベースの作成
   turso db create cs2vault

   # 接続先URLと認証用トークンの取得
   turso db show cs2vault --url
   turso db tokens create cs2vault
   ```
2. **データベースへのスキーマ反映**:
   `.env.local` ファイルに `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を設定し、以下を実行します：
   ```bash
   npm run db:push:turso
   ```
3. **Vercel でのデプロイ設定**:
   - VercelダッシュボードからGitHubリポジトリをインポート。
   - 環境変数をVercelのプロジェクト設定画面に入力。
   - Next.jsの Build Command 設定を以下に上書き：
     ```bash
     prisma generate && npx tsx prisma/push-schema.ts && next build
     ```
   - デプロイを実行。

*注意: メモリ制限によるビルドエラーが発生した場合は、コマンドの先頭に `NODE_OPTIONS=--max-old-space-size=4096` を追記してメモリ制限を拡張してください。*

---

## ライセンス

GPL v3
