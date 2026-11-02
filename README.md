# Lightweight Notes API

API backend nhẹ dùng Node.js 24, không cần thư viện ngoài hoặc database riêng.

## Chạy

```sh
npm test
npm start
# Phát triển, tự khởi động lại khi sửa mã:
npm run dev
```

Mặc định lắng nghe trên `127.0.0.1:3000`. Biến cấu hình: `HOST`, `PORT`,
`DATA_FILE` (mặc định `data/notes.json`, tương đối với thư mục chạy).
Dữ liệu được ghi vào tệp JSON và giữ lại khi khởi động lại. Chỉ chạy một
process cho mỗi tệp dữ liệu.

## API

| Phương thức | Đường dẫn | Chức năng |
| --- | --- | --- |
| GET | `/health` | Kiểm tra sức khỏe |
| GET | `/api/notes` | Danh sách ghi chú |
| POST | `/api/notes` | Tạo ghi chú |
| GET | `/api/notes/:id` | Đọc ghi chú |
| PUT | `/api/notes/:id` | Cập nhật ghi chú |
| DELETE | `/api/notes/:id` | Xóa ghi chú |

POST và PUT nhận JSON `{"text":"Ghi chú"}`; tối đa 2000 ký tự.
Request body tối đa 16 KiB. Lỗi trả JSON với trường `error`.

```sh
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/api/notes \
  -H 'Content-Type: application/json' -d '{"text":"Xin chào"}'
```

Bản khởi đầu phục vụ phát triển nội bộ, chưa có xác thực. Trước khi mở
ra Internet, bổ sung xác thực và triển khai sau reverse proxy có HTTPS.
