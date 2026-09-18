# PFMS Backend — Thiết kế hệ thống hiện tại

Tài liệu mô tả thiết kế đang được triển khai trong repository. [README](../README.md) hướng dẫn cài đặt/chạy; [Swagger](../src/main.ts) cung cấp hợp đồng API chi tiết.

## 1. Tổng quan và công nghệ

PFMS là REST API quản lý thu chi cá nhân với một đơn vị tiền tệ quy ước là VNĐ. Ứng dụng dùng Node.js 24, TypeScript, NestJS 11, Prisma 7, PostgreSQL 16, Redis 7, JWT, Nodemailer, Jest, Docker Compose và GitHub Actions. Tiền được lưu bằng `Decimal(15,2)` trong PostgreSQL.

```text
Client ──HTTP/JSON──> NestJS API ──Prisma──> PostgreSQL
                         ├── ioredis ──> Redis (OTP, auth rate limit)
                         ├── Nodemailer/SMTP ──> Mailpit demo hoặc SMTP thật
                         └── uploads/ ──> file đính kèm local
```

[AppModule](../src/app.module.ts) ghép các module, cấu hình Joi và Pino. [main.ts](../src/main.ts) đặt prefix mặc định `api/v1`, bật `ValidationPipe` (transform, whitelist, cấm thuộc tính ngoài DTO), exception filter và response interceptor toàn cục. Ứng dụng được tổ chức thành các module trong một NestJS server.

## 2. Module và dữ liệu

| Module                                                                                                                     | Behavior hiện có                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Auth](../src/modules/auth/auth.service.ts), [Users](../src/modules/users/users.service.ts)                                | Đăng ký bằng email/mật khẩu, login, refresh/logout, hồ sơ, đổi/quên/đặt lại mật khẩu. |
| [Wallets](../src/modules/wallets/wallets.service.ts)                                                                       | CRUD ví, summary thu/chi, đối soát số dư.                                             |
| [Categories](../src/modules/categories/categories.service.ts)                                                              | Danh mục INCOME/EXPENSE dạng cây; danh mục hệ thống có thể đọc, không sửa/xóa.        |
| [Transactions](../src/modules/transactions/transactions.service.ts)                                                        | Thu, chi, chuyển ví, tra cứu/lọc, CSV, đính kèm, soft delete.                         |
| [Budgets](../src/modules/budgets/budgets.service.ts)                                                                       | Ngân sách MONTH/CUSTOM, theo danh mục hoặc tổng, progress chi tiêu.                   |
| [Goals](../src/modules/goals/goals.service.ts)                                                                             | Mục tiêu và cập nhật tiến độ qua contribute.                                         |
| [Reports](../src/modules/reports/reports.service.ts)                                                                       | Tổng hợp, theo danh mục, xu hướng tuần/tháng.                                         |
| [Notifications](../src/modules/notifications/notification.module.ts), [Health](../src/modules/health/health.controller.ts) | Gửi OTP qua SMTP và kiểm tra PostgreSQL/Redis.                                        |

[Prisma schema](../src/prisma/schema.prisma) định nghĩa các model nghiệp vụ chính: User, RefreshToken, Wallet, Category, Transaction, Budget và Goal. Một migration khởi tạo nằm tại [src/prisma/migrations](../src/prisma/migrations/20260817080147_init/migration.sql). Ví, danh mục và giao dịch dùng `deletedAt`; ngân sách và mục tiêu bị xóa vật lý. Số dư ví gồm `initialBalance` và `currentBalance`; các thao tác giao dịch cập nhật `currentBalance`.

## 3. Authentication và authorization

[AuthService](../src/modules/auth/auth.service.ts) hash mật khẩu bằng bcrypt cost 10. Login/register cấp JWT access và refresh (mặc định 15 phút/7 ngày). Refresh token chỉ lưu SHA-256 hash trong PostgreSQL; refresh kiểm tra hạn/revoked, revoke token cũ rồi cấp cặp mới; logout revoke refresh token. Đổi hoặc đặt lại mật khẩu revoke các refresh token hiện có. Access token là JWT bearer; [JwtStrategy](../src/modules/auth/strategies/jwt.strategy.ts) kiểm tra user còn tồn tại và `isActive` khi xác thực request.

Các controller nghiệp vụ dùng `JwtAuthGuard`. Quyền trên tài nguyên được kiểm tra bằng `userId` trong service/query; upload còn dùng [TransactionOwnershipGuard](../src/modules/transactions/guards/transaction-ownership.guard.ts). Danh mục hệ thống được đọc chung; thao tác sửa/xóa chỉ áp dụng cho danh mục của user.

## 4. Giao dịch và số dư

`POST /transactions` chỉ nhận INCOME/EXPENSE với `amount > 0` và danh mục cùng loại. `POST /transactions/transfer` nhận TRANSFER giữa hai ví khác nhau của cùng user. ADJUSTMENT được sinh bởi wallet reconcile. `PATCH /transactions/:id` nhận amount, categoryId, date, note; categoryId phải hợp lệ và cùng loại với giao dịch thu/chi. Type và hai wallet được giữ nguyên khi PATCH. Giao dịch ADJUSTMENT bị service từ chối PATCH bằng HTTP 400 (`ADJUSTMENT_NOT_EDITABLE`), kể cả PATCH chỉ có note. DELETE dùng soft delete và hoàn nguyên tác động số dư.

Bảng delta `currentBalance`; `a` là amount giao dịch, `b` là amount mới khi PATCH:

| Type       | CREATE                                | PATCH amount a → b            | DELETE                 |
| ---------- | ------------------------------------- | ----------------------------- | ---------------------- |
| INCOME     | ví nguồn `+a`                         | `+(b-a)`                      | `-a`                   |
| EXPENSE    | ví nguồn `-a`                         | `-(b-a)`                      | `+a`                   |
| TRANSFER   | nguồn `-a`, đích `+a`                 | nguồn `-(b-a)`, đích `+(b-a)` | nguồn `+a`, đích `-a`  |
| ADJUSTMENT | do reconcile tạo; ví `+a`, `a` có dấu | HTTP 400, không có mutation   | ví `-a`, kể cả `a < 0` |

Các mutation giao dịch và số dư khi tạo/xóa, hoặc PATCH làm đổi số dư, dùng Prisma `$transaction`. PATCH không đổi amount chỉ cập nhật bản ghi giao dịch.

`GET /transactions` trả giao dịch chưa xóa của user, phân trang mặc định 1/20, sắp xếp date giảm dần. Min/max amount chỉ thêm vào query khi được gửi; lọc trực tiếp `amount` có dấu nên ADJUSTMENT âm xuất hiện nếu không đặt filter. [DTO filter](../src/modules/transactions/dto/find-transactions.dto.ts) biến chuỗi rỗng thành `undefined`, còn `minAmount=0` vẫn lọc `>= 0`. CSV xuất trực tiếp, UTF-8 có BOM. File JPG/PNG/PDF được lưu trong `uploads/`, giới hạn mặc định 5 MB; endpoint tải file và CSV trả nội dung trực tiếp, không có JSON envelope.

## 5. Wallet reconcile và ADJUSTMENT

[WalletsService.reconcile](../src/modules/wallets/wallets.service.ts) so `actualBalance` với `currentBalance`. Chênh lệch 0 không tạo giao dịch. Nếu có chênh lệch và `confirm` chưa true, API chỉ trả difference. Khi xác nhận, Prisma transaction tạo ADJUSTMENT với `amount = actualBalance - currentBalance` (có thể âm) và đặt `currentBalance = actualBalance`. ADJUSTMENT có thể GET và DELETE; PATCH trực tiếp bị chặn như mục 4. Xóa ADJUSTMENT hoàn nguyên bằng `-amount`.

`GET /wallets/:id/summary` cộng riêng INCOME/EXPENSE theo kỳ cho ví; không coi TRANSFER hoặc ADJUSTMENT là thu/chi.

## 6. Ngân sách, mục tiêu và báo cáo

Ngân sách `MONTH` dùng tháng, `CUSTOM` dùng start/end date. [getProgress](../src/modules/budgets/budgets.service.ts) cộng các EXPENSE chưa xóa trong kỳ; nếu có danh mục thì gồm cả danh mục con. API trả `spent`, `remaining`, `percentUsed` và cờ đạt 80%/100%.

`POST /goals/:id/contribute` tăng `currentAmount` của goal và chuyển trạng thái sang COMPLETED khi đạt target. Lệnh này chỉ cập nhật bản ghi goal.

Báo cáo summary/by-category/trend chỉ tổng hợp INCOME và EXPENSE chưa xóa. Summary trả tổng thu, tổng chi và hiệu; trend nhóm theo tuần/tháng, điền các kỳ trống. TRANSFER và ADJUSTMENT không được tính như thu/chi trong các báo cáo này.

## 7. Email OTP và Redis

`POST /auth/forgot-password` trả response chung kể cả email không tồn tại. Với user tồn tại, [AuthService](../src/modules/auth/auth.service.ts) sinh OTP 6 chữ số, lưu bcrypt hash trong Redis với TTL 5 phút, rồi gọi [SmtpOtpDeliveryService](../src/modules/notifications/smtp-otp-delivery.service.ts) gửi plaintext OTP qua SMTP. Nếu gửi lỗi, service cố xóa OTP và vẫn trả response chung. `POST /auth/reset-password` so OTP với hash, đổi mật khẩu, revoke refresh token và xóa OTP. Không ghi plaintext OTP ra log.

[RedisService](../src/redis/redis.service.ts) còn dùng cho rate limit auth bằng script Lua atomic và health PING. Refresh token được quản lý trong PostgreSQL. `OTP_DELIVERY_PROVIDER` hiện chỉ chấp nhận `smtp`. `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM` là bắt buộc; `MAIL_USER`/`MAIL_PASSWORD` có thể cùng trống cho SMTP không auth, hoặc đi cùng nhau khi có auth.

## 8. Response, lỗi, logging, health và rate limit

[ResponseInterceptor](../src/common/interceptors/response.interceptor.ts) bọc JSON thành `{success, statusCode, message, data}` và thêm `meta` cho kết quả phân trang. [AllExceptionsFilter](../src/common/filters/http-exception.filter.ts) trả `{success:false, statusCode, errorCode, message, timestamp, path}`; lỗi validation có thêm `errors`. Error code nằm tại [error-codes.ts](../src/common/constants/error-codes.ts).

[Pino HTTP logger](../src/common/logging/http-logger.config.ts) dùng `X-Request-ID` hợp lệ từ client hoặc sinh UUID, trả lại header này. Request log gồm id, method, path; không log body/header và cấu hình redact dữ liệu nhạy cảm. 4xx là warn, 5xx là error.

`GET /api/v1/health` dùng Terminus kiểm tra PostgreSQL (`SELECT 1`) và Redis (`PING`), timeout mỗi phép kiểm tra 3 giây; lỗi trả 503. [AuthRateLimitGuard](../src/modules/auth/auth-rate-limit.guard.ts) chỉ gắn ở register, login, forgot-password: register 5/IP/giờ; login 20/IP và 5/cặp email-IP trong 5 phút; forgot-password 10/IP và 3/email trong 15 phút. Vượt giới hạn trả 429 và `Retry-After`. IP/email được hash trong Redis key.

## 9. Swagger/OpenAPI

[main.ts](../src/main.ts) tạo OpenAPI từ decorator và bật Bearer auth. Swagger UI tại `/api/docs`, JSON tại `/api/docs-json`; hai path này không phụ thuộc `API_PREFIX`. Route nghiệp vụ mặc định có prefix `/api/v1`. DTO, response schema và lỗi khai báo trong controller; xem Swagger để biết hợp đồng từng endpoint.

## 10. Docker và môi trường

[Dockerfile](../Dockerfile) build nhiều stage bằng Node 24, generate Prisma Client, build TypeScript rồi chạy image production với user `node`. [Entrypoint](../docker/entrypoint.sh) chạy `prisma migrate deploy` trước API. [docker-compose.yml](../docker-compose.yml) có API, PostgreSQL, Redis; PostgreSQL/Redis có healthcheck, API chờ chúng healthy. Database và uploads dùng named volume.

Mailpit nằm trong profile `demo` của Compose. [.env.example](../.env.example) kích hoạt profile này và cấu hình API gửi SMTP đến `mailpit:1025`; hai cổng SMTP/UI được publish trên `127.0.0.1:1025` và `127.0.0.1:8025`. SMTP provider của API được chọn qua `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` và `MAIL_SECURE`; môi trường production dùng SMTP provider thật. Compose đặt `NODE_ENV=production` cho API; file đính kèm nằm trong volume `uploads`.

## 11. Testing và CI

`src/**/*.spec.ts` là unit tests; `test/*.e2e-spec.ts` là E2E với PostgreSQL/Redis thật. Test OTP tự động dùng fake delivery service. `npm run test:cov` chạy unit + E2E và yêu cầu tối thiểu 80% lines/branches theo [coverage config](../test/jest-coverage.json). Local E2E/coverage đọc cấu hình từ `.env.test`.

[GitHub Actions CI](../.github/workflows/ci.yml) chỉ chạy cho pull request vào `main`: PostgreSQL/Redis service, `npm ci`, Prisma generate/migrate, lint, unit, E2E, coverage và build.
