<div align="center">

# CS2Vault

**Bảng Theo Dõi và Phân Tích Thông Tin Thị Trường Counter-Strike 2**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.3-blue?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.4.1-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

Theo dõi biến động giá thị trường, quản lý tài sản kho đồ và khai thác thông tin thị trường CS2 với sự hỗ trợ từ AI.

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[Tính Năng](#tính-năng) · [Hướng Dẫn Cài Đặt](#hướng-dẫn-cài-đặt) · [Cơ Chế Đồng Bộ Dữ Liệu](#cơ-chế-đồng-bộ-dữ-liệu) · [Các Lệnh Điều Khiển](#các-lệnh-điều-khển) · [Triển Khai Sản Phẩm](#triển-khai-sản-phẩm) · [Giấy Phép](#giấy-phép)

</div>

---

## Tính Năng

| Tính năng | Mô tả |
|---------|-------------|
| **Tổng quan thị trường** | Theo dõi giá theo thời gian thực kết nối với API của CSFloat, Pricempire và Steam Community Market. |
| **Quản lý danh mục** | Quản lý kho đồ CS2 cá nhân, cập nhật biến động giá trị tài sản, lưu trữ lịch sử mua/bán và tính toán biên lợi nhuận. |
| **Biến động giá mạnh** | Lọc nhanh các vật phẩm đang tăng hoặc giảm giá mạnh nhất trong các khoảng thời gian ngắn hạn và dài hạn. |
| **Trợ lý Aegis Chat** | Trò chuyện phân tích thị trường tích hợp AI hỗ trợ Google Gemini, OpenAI GPT, Anthropic Claude, OpenRouter và cổng kết nối 9Router. |
| **Bản tin tức RSS** | Tổng hợp tự động các tin tức nóng hổi về nền kinh tế và thị trường Counter-Strike qua RSS. |
| **Biểu đồ giá kỹ thuật** | Xem biểu đồ nến giá trực quan tích hợp các chỉ báo phân tích kỹ thuật sử dụng TradingView Lightweight Charts. |
| **Giao diện thích ứng** | Giao diện responsive tối ưu cho thiết bị di động, máy tính bảng và máy tính để bàn bằng CSS Modules. |

---

## Công Nghệ Sử Dụng

- **Framework**: Next.js 16.1.6 (App Router, React Compiler)
- **Giao diện & Phong cách**: React 19.2.3, CSS Modules (Hệ thống màu sắc và font được cấu hình tại `src/app/globals.css`)
- **Cơ sở dữ liệu & ORM**: SQLite (Môi trường phát triển cục bộ) / Turso (Môi trường sản xuất libSQL). Quản lý bởi Prisma 7.4.1 (Prisma client tự động tạo tại `src/generated/prisma`)
- **Xác thực người dùng**: NextAuth.js (Đăng nhập qua Steam OpenID)
- **Biểu đồ**: TradingView Lightweight Charts & thư viện `lightweight-charts-indicators`
- **Tích hợp AI**: SDK chính thức của Gemini, OpenAI, Anthropic cùng các tùy chọn proxy qua OpenRouter và 9Router

---

## Hướng Dẫn Cài Đặt

### Yêu cầu hệ thống

- Node.js phiên bản 20 trở lên
- npm, pnpm hoặc yarn

### Cài đặt và khởi chạy cục bộ

```bash
# Tải kho mã nguồn về máy
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# Cài đặt các gói phụ thuộc
npm install

# Tạo tệp cấu hình môi trường từ tệp mẫu
cp .env.example .env.local

# Khởi tạo thư viện Prisma client
npx prisma generate

# Đồng bộ cấu trúc cơ sở dữ liệu SQLite cục bộ
npx prisma db push

# Nạp dữ liệu cấu hình ban đầu
npx tsx prisma/seed.ts

# Khởi chạy máy chủ phát triển
npm run dev
```

Sau khi khởi chạy thành công, truy cập ứng dụng tại địa chỉ [http://localhost:3000](http://localhost:3000).

---

## Biến Môi Trường

Môi trường phát triển cục bộ sẽ tự động đọc các giá trị cấu hình từ tệp `.env.local`.

| Tên biến | Bắt buộc | Mô tả |
|----------|----------|-------------|
| `DATABASE_URL` | Có | Đường dẫn đến tệp cơ sở dữ liệu SQLite cục bộ (mặc định: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | Production | URL cơ sở dữ liệu đám mây Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Production | Mã xác thực cơ sở dữ liệu Turso |
| `CRON_SECRET` | Production | Mã bảo mật để xác thực các yêu cầu chạy tác vụ cron tự động |
| `STEAM_API_KEY` | Có | [Khóa Steam Web API](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | Có | Steam64 ID của tài khoản được phép đăng nhập hệ thống |
| `CSFLOAT_API_KEY` | Có | [Khóa API từ nền tảng CSFloat](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | Không | [Khóa API từ nền tảng Pricempire](https://pricempire.com/) |
| `GEMINI_API_KEY` | Không | [Khóa API Google AI Studio](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | Không | [Khóa API OpenAI](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | Không | Thay thế model OpenAI mặc định (mặc định: `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | Không | [Khóa API Anthropic Console](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_MODEL` | Không | Thay thế model Anthropic mặc định (mặc định: `claude-opus-4-7`) |
| `OPENROUTER_API_KEY` | Không | [Khóa API OpenRouter](https://openrouter.ai/settings/keys) |
| `OPENROUTER_BASE_URL` | Không | URL cổng OpenRouter (mặc định: `https://openrouter.ai/api/v1`) |
| `OPENROUTER_MODEL` | Không | Thay thế model OpenRouter mặc định (mặc định: `~openai/gpt-latest`) |
| `NINEROUTER_API_KEY` | Không | Khóa cổng kết nối 9Router |
| `NINEROUTER_BASE_URL` | Không | URL cổng kết nối 9Router (mặc định: `http://localhost:20128/v1`) |
| `NINEROUTER_MODEL` | Không | Thay thế model 9Router mặc định (mặc định: `cc/claude-opus-4-7`) |
| `GOOGLE_CLIENT_ID` | Không | Google OAuth client ID (sử dụng cho luồng đăng nhập Gemini) |
| `GOOGLE_CLIENT_SECRET` | Không | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Có | Mã bí mật để mã hóa phiên đăng nhập (tạo bằng lệnh `openssl rand -hex 32`) |
| `NEXTAUTH_URL` | Có | URL chạy ứng dụng (mặc định: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | Có | Khóa đối xứng dùng để mã hóa thông tin xác thực lưu trong cơ sở dữ liệu |

---

## Cơ Chế Đồng Bộ Dữ Liệu

Tác vụ làm mới dữ liệu được phân chia giữa máy chủ chạy tự động và trình kích hoạt ở phía client:

1. **Tác vụ Cron trên Vercel** (cấu hình trong `vercel.json`):
   - `GET /api/sync`: Chạy hằng ngày (`0 4 * * *`) để đồng bộ dữ liệu giá chung từ thị trường.
   - `GET /api/market/market-cap-sync`: Chạy hằng ngày (`0 8 * * *`) để tính toán lại vốn hóa thị trường có trọng số.
2. **Bộ lập lịch ngoài** (ví dụ: cron-job.org):
   - `GET /api/intelligence/run`: Đường dẫn này đã được loại bỏ khỏi cấu hình `vercel.json` và cần được cấu hình chạy mỗi 5 phút qua các dịch vụ cron bên ngoài (yêu cầu gửi kèm header chứa mã `CRON_SECRET`). Nhiệm vụ này kiểm tra các vật phẩm tiềm năng phát hiện từ CSFloat và xác thực thông tin thông qua Steam Community Market (SCM). Nhằm tránh việc bị Steam chặn kết nối, số lượt xác thực SCM được giới hạn tối đa 3 lần mỗi lượt chạy, đảm bảo tuân thủ giới hạn an toàn SCM là 19 yêu cầu/phút và 950 yêu cầu/ngày.
3. **Tự động cập nhật trên trình duyệt**:
   - Khi tab trang quản trị đang hoạt động, ứng dụng sẽ tự động làm mới giá trị danh sách theo dõi và kho đồ dựa theo số phút cấu hình trong trường `priceRefreshIntervalMin` trong cơ sở dữ liệu.
   - Người dùng cũng có thể buộc tính toán lại vốn hóa thị trường ngay lập tức bằng nút bấm trong phần Cài Đặt.

---

## Các Lệnh Điều Khiển

Quản lý vòng đời dự án bằng các dòng lệnh `npm` dưới đây:

| Lệnh | Ý nghĩa chức năng |
|--------|-------------|
| `npm run dev` | Khởi chạy máy chủ phát triển Next.js hỗ trợ tải lại trực tiếp (hot-reload). |
| `npm run build` | Tạo Prisma client, đồng bộ/nạp cơ sở dữ liệu và đóng gói sản phẩm Next.js production. |
| `npm run start` | Khởi chạy máy chủ sản xuất Next.js sau khi đã build xong. |
| `npm run lint` | Kiểm tra cú pháp và định dạng mã nguồn bằng ESLint. |
| `npm run test` | Chạy bộ kiểm thử đơn vị và tích hợp với Vitest. |
| `npm run test:watch` | Chạy bộ kiểm thử đơn vị với chế độ tự động theo dõi thay đổi. |
| `npm run db:push:turso` | Đồng bộ cấu trúc cơ sở dữ liệu cục bộ và nạp dữ liệu cấu hình lên cơ sở dữ liệu Turso sản xuất. |
| `npm run db:migrate` | Tạo và áp dụng tệp di cư (migration) mới trên cơ sở dữ liệu SQLite cục bộ. |
| `npm run db:studio` | Khởi chạy giao diện web quản trị cơ sở dữ liệu Prisma Studio trực quan. |

---

## Triển Khai Sản Phẩm

### Môi trường sản xuất: Vercel + Turso

Dự án sử dụng cơ sở dữ liệu đám mây Turso để cung cấp dịch vụ SQLite trên nền tảng Serverless thông qua giao thức HTTP.

1. **Khởi tạo cơ sở dữ liệu Turso**:
   ```bash
   # Cài đặt Turso CLI trên máy
   curl -sSfL https://get.tur.so/install.sh | bash

   # Khởi tạo một cơ sở dữ liệu mới
   turso db create cs2vault

   # Lấy đường dẫn kết nối và mã khóa bảo mật
   turso db show cs2vault --url
   turso db tokens create cs2vault
   ```
2. **Đồng bộ cấu trúc lên Turso**:
   Cấu hình các giá trị `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` vào tệp `.env.local` của bạn, sau đó chạy lệnh:
   ```bash
   npm run db:push:turso
   ```
3. **Triển khai ứng dụng trên Vercel**:
   - Kết nối kho mã nguồn GitHub của bạn với Vercel.
   - Nhập toàn bộ biến môi trường từ tệp cấu hình vào phần thiết lập của dự án trên Vercel.
   - Ghi đè lệnh build (Build Command) mặc định thành:
     ```bash
     prisma generate && npx tsx prisma/push-schema.ts && next build
     ```
   - Thực hiện triển khai (Deploy).

*Lưu ý: Nếu quá trình biên dịch gặp lỗi quá tải bộ nhớ (OOM), hãy thêm tiền tố sau vào trước lệnh build: `NODE_OPTIONS=--max-old-space-size=4096`*

---

## Giấy Phép

GPL v3
