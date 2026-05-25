<div align="center">

# CS2Vault

**Bảng điều khiển thông tin thị trường Counter-Strike 2**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

Theo dõi giá, quản lý kho đồ và nhận thông tin thị trường bằng AI.

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[Tính năng](#tính-năng) · [Bắt đầu](#bắt-đầu) · [Triển khai](#triển-khai) · [Giấy phép](#giấy-phép)

</div>

---

## Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| **Tổng quan thị trường** | Theo dõi giá theo thời gian thực với CSFloat, Pricempire và Steam |
| **Quản lý danh mục** | Theo dõi giá trị kho đồ CS2 với dữ liệu giá lịch sử |
| **Biến động lớn** | Xem các vật phẩm đang tăng hoặc giảm giá trị |
| **Trò chuyện AI** | Phân tích thị trường bằng Google Gemini và OpenAI |
| **Bản tin** | Tổng hợp tin tức thị trường CS2 qua RSS |
| **Chi tiết vật phẩm** | Biểu đồ nến giá với TradingView Lightweight Charts |
| **Giao diện đáp ứng** | Hoạt động trên máy tính, máy tính bảng và điện thoại |

## Công nghệ

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

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, React Compiler)
- **Cơ sở dữ liệu**: SQLite qua [Prisma](https://prisma.io) + [Turso](https://turso.tech/) (libSQL)
- **Xác thực**: [NextAuth.js](https://next-auth.js.org) (Steam OpenID)
- **Biểu đồ**: [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- **AI**: Google Gemini, OpenAI GPT
- **Giao diện**: CSS Modules (giao diện tối, thêm giao diện khác đang lên kế hoạch)

## Bắt đầu

### Yêu cầu

- Node.js 20+
- npm / pnpm / yarn

### Cài đặt nhanh

```bash
# Sao chép kho mã nguồn
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# Cài đặt các phụ thuộc
npm install

# Sao chép mẫu biến môi trường và điền các khóa của bạn
cp .env.example .env.local

# Tạo Prisma client và cơ sở dữ liệu cục bộ
npx prisma generate
npx prisma db push

# Khởi tạo cài đặt mặc định
npx tsx prisma/seed.ts

# Khởi động máy chủ phát triển
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

### Biến môi trường

<details>
<summary>Nhấn để mở bảng biến môi trường</summary>

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `DATABASE_URL` | Có | Đường dẫn SQLite cho phát triển cục bộ (mặc định: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | Vercel | URL cơ sở dữ liệu Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Vercel | Mã thông báo xác thực Turso |
| `CRON_SECRET` | Vercel | Mã bảo mật cho Vercel Cron |
| `STEAM_API_KEY` | Có | [Khóa Steam Web API](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | Có | Steam64 ID của bạn để xác thực |
| `CSFLOAT_API_KEY` | Có | [Khóa CSFloat API](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | Không | [Khóa Pricempire API](https://pricempire.com/) |
| `GEMINI_API_KEY` | Không | [Khóa Google AI Studio](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | Không | [Khóa OpenAI API](https://platform.openai.com/api-keys) |
| `GOOGLE_CLIENT_ID` | Không | Google OAuth client ID (cho luồng Gemini OAuth) |
| `GOOGLE_CLIENT_SECRET` | Không | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Có | Tạo bằng `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Có | URL ứng dụng (mặc định: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | Có | Khóa mã hóa cho các mã thông báo đã lưu |

</details>

### Mô hình làm mới dữ liệu

- **Đồng bộ máy chủ nền**: `vercel.json` lên lịch đồng bộ thị trường hằng ngày, đồng bộ vốn hóa thị trường hằng ngày và kiểm tra `GET /api/intelligence/run` mỗi 5 phút với tối đa 3 xác thực SCM mỗi lần chạy.
- **Làm mới khi mở tab**: ứng dụng sử dụng cài đặt `priceRefreshIntervalMin` đã lưu để làm mới dữ liệu thị trường trên trang chủ, danh sách theo dõi và danh mục khi trình duyệt mở.
- **Làm mới vốn hóa thị trường thủ công**: Cài đặt hiện có hành động `Làm mới vốn hóa thị trường` giúp tính toán lại có trọng số mới ngay lập tức.

### Lệnh thường dùng

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Khởi động máy chủ phát triển |
| `npm run build` | Build sản xuất |
| `npm run start` | Khởi động máy chủ sản xuất |
| `npm run lint` | Chạy ESLint |
| `npm run test` | Chạy kiểm thử Vitest |
| `npm run db:push:turso` | Đẩy schema + seed đến Turso |

## Triển khai

### Vercel + Turso

Ứng dụng này sử dụng [Turso](https://turso.tech/) làm cơ sở dữ liệu đám mây cho triển khai Vercel.

<details>
<summary><strong>1. Thiết lập Turso</strong></summary>

```bash
# Cài đặt Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Tạo cơ sở dữ liệu
turso db create cs2vault

# Lấy thông tin xác thực
turso db show cs2vault --url
turso db tokens create cs2vault
```

</details>

<details>
<summary><strong>2. Đẩy schema đến Turso</strong></summary>

```bash
# Đặt thông tin xác thực trong .env.local, sau đó:
npm run db:push:turso
```

</details>

<details>
<summary><strong>3. Triển khai lên Vercel</strong></summary>

1. Nhập kho GitHub tại [vercel.com/new](https://vercel.com/new)
2. Thêm tất cả biến môi trường từ `.env.example` trong bảng điều khiển Vercel
3. Đặt ghi đè lệnh build: `npx prisma generate && next build`
4. Triển khai

</details>

<details>
<summary><strong>4. Cron và hành vi làm mới</strong></summary>

`vercel.json` cấu hình cron hằng ngày cho `GET /api/sync` (`0 4 * * *`), hằng ngày cho `GET /api/market/market-cap-sync` (`0 8 * * *`) và mỗi 5 phút cho `GET /api/intelligence/run` (`*/5 * * * *`). Với yêu cầu được xác thực cron, intelligence runner giữ SCM ở mức 3 xác thực mỗi lần chạy và áp dụng giới hạn an toàn 19/phút và 950/ngày. Đặt `CRON_SECRET` trong Vercel để yêu cầu cron được xác thực.

Nếu gói Vercel của bạn không hỗ trợ cron 5 phút, hãy gọi `/api/intelligence/run` từ bộ lập lịch bên ngoài với cùng `CRON_SECRET`. Các phiên đang mở vẫn làm mới dữ liệu thị trường phía máy khách qua `Khoảng thời gian làm mới trình duyệt (phút)`, và bạn có thể dùng trang Cài đặt để buộc làm mới vốn hóa thị trường theo yêu cầu.

</details>

### Phát triển cục bộ

Đối với phát triển cục bộ, ứng dụng sử dụng tệp SQLite cục bộ (`dev.db`) tự động — không cần Turso.

### Cấu hình Build

Nếu gặp lỗi OOM trong quá trình build:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

---

<div align="center">

## Giấy phép

GPL v3

</div>
