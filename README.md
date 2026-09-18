# PFMS Backend

PFMS (Personal Finance Management System) là REST API quản lý thu chi cá nhân. Hệ thống hỗ trợ xác thực bằng JWT, quản lý ví và danh mục dạng cây, ghi nhận thu/chi/chuyển khoản, ngân sách, mục tiêu tiết kiệm, báo cáo, đối soát số dư, xuất CSV và đính kèm hóa đơn.

Theo giả định thiết kế, mọi khoản tiền dùng chung một đơn vị tiền tệ, mặc định quy ước là VNĐ. Schema/API hiện không lưu mã tiền tệ và không hỗ trợ quy đổi tỷ giá.

## Tech stack

- Node.js 24 và TypeScript
- NestJS 11
- Prisma 7 với PostgreSQL 16
- Redis 7 cho OTP đặt lại mật khẩu và rate limit auth
- JWT access token và refresh token
- Jest cho unit test, E2E test và coverage
- Swagger/OpenAPI
- Docker và Docker Compose
- GitHub Actions CI

## Yêu cầu hệ thống

### Chạy ứng dụng trên host

- Node.js 24.x
- npm
- PostgreSQL 16
- Redis 7

Có thể dùng PostgreSQL và Redis đã cài trên máy, hoặc khởi động các service này cùng Mailpit bằng Docker Compose.

### Chạy toàn bộ bằng container

- Docker Engine hoặc Docker Desktop
- Docker Compose plugin hỗ trợ lệnh `docker compose`

## Cài đặt local

Clone repository, chuyển vào thư mục project rồi cài dependency theo lockfile:

```bash
git clone https://github.com/mahn117/pfms-backend.git
cd pfms-backend
npm ci
```

Tạo file môi trường. Trên Linux, macOS hoặc Git Bash:

```bash
cp .env.example .env
```

Trên PowerShell:

```powershell
Copy-Item .env.example .env
```

Khi API chạy trực tiếp trên host, `DATABASE_URL` và `REDIS_URL` dùng `localhost` như mẫu. Nếu PostgreSQL/Redis được publish ở cổng khác, sửa URL theo `POSTGRES_HOST_PORT`/`REDIS_HOST_PORT`. Đặt `MAIL_HOST=127.0.0.1` và giữ `MAIL_PORT=1025` khi Mailpit chạy trong Docker, kể cả API chạy trên Windows; tên `mailpit` chỉ phân giải trong mạng Compose. Nếu đổi `POSTGRES_USER`, `POSTGRES_PASSWORD` hoặc `POSTGRES_DB`, cập nhật `DATABASE_URL` trong `.env` cho cùng database trước khi chạy Prisma CLI/seed trên host.

Nếu chưa có PostgreSQL và Redis trên máy, khởi động chúng cùng Mailpit bằng Compose:

```bash
docker compose up -d postgres redis mailpit
```

Generate Prisma Client, áp dụng migration đã commit và tạo dữ liệu demo:

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

Chạy ứng dụng ở chế độ development có tự động build lại khi source thay đổi:

```bash
npm run start:dev
```

API mặc định chạy tại `http://localhost:3000/api/v1`.

Để chạy production build trên host:

```bash
npm run build
npm run start:prod
```

`npm run start:prod` chỉ chạy output trong `dist/`, vì vậy phải build trước.

## Chạy bằng Docker Compose

Tạo `.env` nếu chưa có:

```bash
cp .env.example .env
```

Để chạy demo, giữ `COMPOSE_PROFILES=demo`, `MAIL_HOST=mailpit` và `MAIL_PORT=1025` từ `.env.example`. Đổi JWT secrets trước khi chia sẻ môi trường; nếu đổi `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, đồng bộ `DATABASE_URL` để Prisma CLI và seed chạy trên host dùng đúng thông tin. Compose tự tạo URL PostgreSQL và Redis riêng cho API container. Sau đó build và chạy API, PostgreSQL, Redis và Mailpit:

```bash
docker compose up -d --build
```

Kiểm tra trạng thái và log:

```bash
docker compose ps
docker compose logs -f api
```

API container chờ PostgreSQL và Redis healthy; Mailpit chạy cùng Compose ở profile `demo`. Sau đó entrypoint tự chạy `prisma migrate deploy` trước khi khởi động `node dist/main.js`.

Port API trên host lấy từ `API_HOST_PORT`, mặc định là `3000`. PostgreSQL, Redis và hai cổng Mailpit chỉ được publish trên `127.0.0.1` của host. Kiểm tra API và phụ thuộc tại `http://localhost:3000/api/v1/health` (đổi port nếu dùng `API_HOST_PORT` khác). Dữ liệu PostgreSQL và file upload nằm trong named volume `pgdata` và `uploads`.

Mailpit chỉ dùng cho local/demo. Mở [http://localhost:8025](http://localhost:8025) để xem email thử nghiệm. Dùng [Swagger UI](http://localhost:3000/api/docs) để thử luồng quên mật khẩu:

1. Tạo tài khoản hoặc chạy seed để có tài khoản demo.
2. Gọi `POST /api/v1/auth/forgot-password` với `{"email":"test.user@pfms.local"}` (hoặc email đã đăng ký). Response luôn là thông báo chung.
3. Mở Mailpit UI, lấy OTP 6 chữ số trong email mới nhất gửi tới địa chỉ đó.
4. Gọi `POST /api/v1/auth/reset-password` với `email`, `otp` và `newPassword` dài ít nhất 8 ký tự.
5. Gọi `POST /api/v1/auth/login` bằng mật khẩu mới. Seed chạy lại sẽ đặt lại mật khẩu của tài khoản demo.

Seed không tự chạy khi container khởi động và production image hiện không chứa seed runner. Nếu cần tài khoản/data demo, hãy cài dependency trên host rồi chạy:

```bash
npx prisma db seed
```

Với `.env.example` mặc định, lệnh trên kết nối tới PostgreSQL Compose qua `localhost:5432`.

Dừng các container:

```bash
docker compose down
```

Lệnh này không xóa named volume. Không dùng tùy chọn `--volumes` nếu muốn giữ dữ liệu.

## Biến môi trường

Ứng dụng đọc `.env` thông qua `@nestjs/config`; Prisma CLI cũng đọc `DATABASE_URL` từ file này. Docker Compose dùng cùng file cho cấu hình container và host port.

| Biến                   | Bắt buộc              | Giá trị mẫu/default                                        | Mục đích                                                                                                            |
| ---------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`             | Không                 | `development`                                              | Môi trường chạy: `development`, `production` hoặc `test`. Compose đặt API thành `production`.                       |
| `PORT`                 | Không                 | `3000`                                                     | Port NestJS lắng nghe bên trong host/container.                                                                     |
| `API_PREFIX`           | Không                 | `api/v1`                                                   | Global prefix của API nghiệp vụ.                                                                                    |
| `TRUSTED_PROXY_IPS`    | Không                 | Trống                                                      | Danh sách IP proxy tin cậy, phân cách bằng dấu phẩy. Để trống khi không chạy sau reverse proxy.                     |
| `COMPOSE_PROFILES`     | Không                 | `demo`                                                     | Bật service Mailpit khi chạy Compose local/demo; bỏ profile này khi triển khai production.                          |
| `API_HOST_PORT`        | Không                 | `3000`                                                     | Port API được Docker Compose publish ra host.                                                                       |
| `POSTGRES_HOST_PORT`   | Không                 | `5432`                                                     | Port PostgreSQL được Compose publish trên `127.0.0.1`.                                                              |
| `REDIS_HOST_PORT`      | Không                 | `6379`                                                     | Port Redis được Compose publish trên `127.0.0.1`.                                                                   |
| `POSTGRES_USER`        | Không                 | `pfms`                                                     | User PostgreSQL do Compose tạo.                                                                                     |
| `POSTGRES_PASSWORD`    | Không                 | `pfms`                                                     | Password PostgreSQL do Compose tạo; phải đổi khi deploy.                                                            |
| `POSTGRES_DB`          | Không                 | `pfms`                                                     | Tên database PostgreSQL do Compose tạo.                                                                             |
| `DATABASE_URL`         | Có khi chạy trên host | `postgresql://pfms:pfms@localhost:5432/pfms?schema=public` | Chuỗi kết nối PostgreSQL cho app, Prisma CLI và seed. Compose override hostname thành `postgres` cho API container. |
| `REDIS_URL`            | Có khi chạy trên host | `redis://localhost:6379`                                   | Chuỗi kết nối Redis. Compose override hostname thành `redis` cho API container.                                     |
| `JWT_ACCESS_SECRET`    | Có                    | `change-me`                                                | Secret ký access token; giá trị mẫu không an toàn cho production.                                                   |
| `JWT_ACCESS_EXPIRES`   | Không                 | `15m`                                                      | Thời hạn access token.                                                                                              |
| `JWT_REFRESH_SECRET`   | Có                    | `change-me-too`                                            | Secret ký refresh token; phải khác access secret.                                                                   |
| `JWT_REFRESH_EXPIRES`  | Không                 | `7d`                                                       | Thời hạn refresh token.                                                                                             |
| `OTP_DELIVERY_PROVIDER` | Có                    | `smtp`                                                     | Provider gửi OTP; hiện chỉ hỗ trợ SMTP.                                                                             |
| `MAIL_HOST`             | Có                    | `mailpit`                                                  | Trong Compose dùng `mailpit`; khi API chạy trên host dùng `127.0.0.1`. Production dùng host SMTP thật.              |
| `MAIL_PORT`             | Có                    | `1025`                                                     | Port Mailpit local/demo; production dùng port do SMTP provider cung cấp.                                             |
| `MAIL_USER`             | Theo SMTP provider    | Trống                                                      | Username SMTP. Phải cấu hình cùng `MAIL_PASSWORD` nếu relay yêu cầu authentication.                                 |
| `MAIL_PASSWORD`         | Theo SMTP provider    | Trống                                                      | Password SMTP. Không được commit hoặc ghi ra log.                                                                   |
| `MAIL_FROM`             | Có                    | `PFMS <no-reply@example.com>`                              | Sender demo; production phải dùng sender/domain đã được SMTP provider xác minh.                                     |
| `MAIL_SECURE`           | Không                 | `false`                                                    | Bật TLS trực tiếp; thường đặt `true` khi dùng port 465.                                                             |
| `MAIL_CONNECTION_TIMEOUT_MS` | Không           | `10000`                                                    | Timeout kết nối, greeting và socket SMTP tính bằng mili giây.                                                       |
| `SMS_PROVIDER_API_KEY` | Không                 | Trống                                                      | Dự phòng cho SMS provider; hiện chưa có consumer.                                                                   |
| `UPLOAD_STORAGE`       | Không                 | `local`                                                    | Validation chấp nhận `local` hoặc `s3`, nhưng implementation hiện chỉ lưu local.                                    |
| `UPLOAD_MAX_SIZE_MB`   | Không                 | `5`                                                        | Dung lượng tối đa của file đính kèm, tính theo MB.                                                                  |

Luồng quên mật khẩu lưu hash OTP trong Redis với TTL 5 phút rồi gửi plaintext OTP một lần qua SMTP. Ứng dụng không ghi OTP, email nhận hoặc SMTP credential ra log. Nếu SMTP thất bại, ứng dụng best-effort xoá OTP vừa lưu nhưng vẫn trả response chung để không tiết lộ account existence.

Để gửi email production, bỏ `COMPOSE_PROFILES=demo`, thay `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` trong `.env` bằng cấu hình của SMTP provider thật (ví dụ Brevo); đặt `MAIL_SECURE` theo chế độ TLS của provider. Không dùng Mailpit hoặc địa chỉ sender demo ở production. Automated tests thay delivery service bằng fake và không kết nối SMTP thật.

## Prisma và database

Generate Prisma Client:

```bash
npx prisma generate
```

Tạo migration mới trong quá trình phát triển schema:

```bash
npx prisma migrate dev --name your_migration_name
```

Áp dụng các migration đã commit, không tạo migration mới:

```bash
npx prisma migrate deploy
```

Chạy seed thủ công:

```bash
npx prisma db seed
```

Prisma schema, migrations và seed lần lượt nằm tại:

- `src/prisma/schema.prisma`
- `src/prisma/migrations/`
- `src/prisma/seed.ts`

Seed được cấu hình trong `prisma.config.ts`. Seed có thể chạy lại tuần tự mà không tạo trùng bộ dữ liệu demo. Không chạy đồng thời nhiều tiến trình seed trên cùng database.

## Lint, test và build

### Chuẩn bị database test trên máy local

Các lệnh `test:e2e` và `test:cov` dùng PostgreSQL/Redis thật và đọc `.env.test`; file này không được commit. Nếu trước đó chỉ chạy ứng dụng bằng Docker, cần cài Node.js 24 trên host, chạy `npm ci` và `npx prisma generate` trước khi chạy test.

1. Khởi động PostgreSQL và Redis (nếu chưa chạy): `docker compose up -d postgres redis`.
2. Tạo database test một lần với user từ cấu hình Compose:

   ```bash
   docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" pfms_test'
   ```

   Nếu database `pfms_test` đã tồn tại, bỏ qua bước này. Nếu dùng PostgreSQL cài trên host, tạo database cùng tên bằng công cụ PostgreSQL của bạn.
3. Sao chép `.env.example` thành `.env.test` (PowerShell dùng `Copy-Item .env.example .env.test`). Đặt `NODE_ENV=test`, `DATABASE_URL` trỏ đến `pfms_test` trên host với đúng user/password/port PostgreSQL của bạn, và `REDIS_URL=redis://127.0.0.1:6379/1` (đổi port nếu cần). `MAIL_HOST=127.0.0.1` là giá trị phù hợp nếu API test chạy trên host; automated tests dùng fake delivery service nên không gửi SMTP thật.
4. Áp dụng migration vào database test:

   ```bash
   npx dotenv -e .env.test -- prisma migrate deploy
   ```

Kiểm tra lint mà không tự sửa file:

```bash
npm run lint:check
```

Chạy lint và tự sửa lỗi có thể sửa được:

```bash
npm run lint
```

Chạy unit test:

```bash
npm run test
```

Chạy E2E test:

```bash
npm run test:e2e
```

Chạy unit và E2E test kèm coverage gate:

```bash
npm run test:cov
```

Build production:

```bash
npm run build
```

Trên GitHub Actions, workflow inject trực tiếp các biến môi trường test thay cho `.env.test`. Coverage gate yêu cầu tối thiểu 80% cho lines và branches.

## Swagger và OpenAPI

Sau khi API khởi động với port mặc định:

- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`
- Health: `http://localhost:3000/api/v1/health` (kiểm tra PostgreSQL và Redis; trả HTTP 503 nếu phụ thuộc lỗi)

Hai path Swagger đang được cấu hình trực tiếp và không thay đổi theo `API_PREFIX`. Khi chạy Docker với `API_HOST_PORT` khác `3000`, thay port trong URL tương ứng.

### Đăng nhập và dùng Bearer token

1. Mở Swagger UI và gọi `POST /api/v1/auth/login`.
2. Gửi body:

   ```json
   {
     "email": "test.user@pfms.local",
     "password": "Test@12345"
   }
   ```

3. Sao chép `data.accessToken` từ response.
4. Nhấn **Authorize** ở đầu Swagger UI.
5. Nhập access token. Swagger UI sẽ gửi token trong header `Authorization: Bearer <access-token>` cho các endpoint được bảo vệ.

## Tài khoản và dữ liệu demo

Tài khoản được tạo bởi `npx prisma db seed`:

| Email                  | Mật khẩu     | Role   |
| ---------------------- | ------------ | ------ |
| `test.user@pfms.local` | `Test@12345` | `USER` |

Trên database mới, seed tạo:

- 31 system category thu/chi, bao gồm category cha và category con.
- Ví `Tiền mặt`: số dư đầu kỳ `1.000.000`, số dư sau giao dịch mẫu `2.800.000`.
- Ví `Tài khoản ngân hàng`: số dư đầu kỳ `5.000.000`, số dư sau giao dịch mẫu `18.000.000`.
- Một giao dịch thu nhập `15.000.000`.
- Hai giao dịch chi tiêu `120.000` và `80.000`.
- Một giao dịch chuyển `2.000.000` từ tài khoản ngân hàng sang tiền mặt.

Credential này công khai và chỉ dành cho local/demo. Mỗi lần chạy seed sẽ đưa tài khoản demo về password, role và trạng thái active đã định nghĩa trong seed.

## Cấu trúc thư mục

```text
.
├── .github/workflows/       # GitHub Actions CI
├── docker/                  # Entrypoint của API container
├── src/
│   ├── common/              # Filter, guard, interceptor, logging, Swagger schema
│   ├── config/              # Validation biến môi trường
│   ├── modules/             # Các module NestJS theo domain/chức năng
│   │   ├── auth/
│   │   ├── budgets/
│   │   ├── categories/
│   │   ├── goals/
│   │   ├── health/
│   │   ├── notifications/
│   │   ├── reports/
│   │   ├── transactions/
│   │   ├── users/
│   │   └── wallets/
│   ├── prisma/              # Schema, migrations, seed và Prisma service
│   ├── redis/               # Redis module và service
│   ├── app.module.ts        # Composition root của ứng dụng
│   └── main.ts              # Bootstrap NestJS và Swagger
├── test/                    # E2E suites, fixtures và Jest config
├── Dockerfile
├── docker-compose.yml
├── prisma.config.ts
└── package.json
```

Các thư mục `node_modules/`, `dist/`, `coverage/` và `src/generated/prisma/` là dependency/generated output nên không được mô tả như source cần chỉnh sửa. `uploads/` là dữ liệu runtime khi dùng local storage.

## GitHub Actions CI

Workflow `.github/workflows/ci.yml` chạy khi có pull request vào `main`. Job hiện tại:

1. Khởi động PostgreSQL 16 và Redis 7 service containers.
2. Dùng Node.js 24 và chạy `npm ci`.
3. Chạy `npx prisma generate`.
4. Chạy `npx prisma migrate deploy` trên test database.
5. Chạy `npm run lint:check`.
6. Chạy unit test bằng `npm run test -- --runInBand`.
7. Chạy E2E bằng `npm run test:e2e -- --runInBand`.
8. Chạy coverage gate bằng `npm run test:cov`.
9. Chạy `npm run build`.

Repository hiện chưa có workflow CD tự động.

## Deploy tối thiểu bằng Docker Compose

Compose build image trực tiếp từ source trên máy đích. Tạo `.env` từ file mẫu:

```bash
cp .env.example .env
```

Trước khi chạy, sửa `.env` cho production:

1. Bỏ profile demo bằng `COMPOSE_PROFILES=` để không khởi động Mailpit.
2. Đặt `POSTGRES_PASSWORD` và hai JWT secret mạnh, khác nhau; đồng bộ `DATABASE_URL` với user/password/database/host port PostgreSQL nếu chạy Prisma CLI trên host. Với cấu hình Compose hiện tại, chọn mật khẩu PostgreSQL có thể dùng an toàn trong URL kết nối.
3. Cấu hình `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` và `MAIL_SECURE` theo SMTP provider thật (ví dụ Brevo). User/password phải đi cùng nhau nếu relay cần auth; sender/domain phải được provider cho phép. Không dùng `mailpit`, port `1025` hoặc sender demo trong production.

Sau đó chạy:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

Khi API container khởi động, entrypoint tự áp dụng migration bằng `prisma migrate deploy`. Compose dùng named volume để giữ PostgreSQL data và file upload qua các lần recreate container. Nếu `pgdata` đã tồn tại, đổi `POSTGRES_PASSWORD` trong `.env` không tự đổi password trong PostgreSQL hiện có.

Đây là cách chạy Compose tối thiểu; repository chưa có image registry, reverse proxy/TLS hoặc pipeline CD.

## Lưu ý production

- Thay `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET`; không dùng các giá trị mẫu.
- Dùng hai JWT secret mạnh, ngẫu nhiên và khác nhau.
- Không commit `.env`, `.env.test` hoặc secret vào Git.
- Không chạy seed demo trên production.
- Local upload hiện nằm trong Docker named volume; chưa có object storage/S3 thực tế.
- OTP quên mật khẩu được lưu dưới dạng hash trong Redis với TTL 5 phút, gửi qua SMTP và không được ghi plaintext ra console. Mailpit trong Compose dành cho local/demo; cần cấu hình SMTP relay cùng sender/domain production hợp lệ trước khi public hệ thống.
- Project chưa cấu hình reverse proxy hoặc TLS/HTTPS.
- Project chưa có CD tự động; GitHub Actions hiện chỉ thực hiện CI cho pull request vào `main`.
- Cần tự thiết lập backup, giám sát, domain, TLS và chính sách vận hành phù hợp trước khi public hệ thống.
