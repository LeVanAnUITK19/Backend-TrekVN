# Trekking Service Migration Scripts

## migrate-province-ids.js

Script để fix provinceId từ tên đầy đủ (VD: "Lâm Đồng") sang slug (VD: "lam_dong").

### Vấn đề

Web Admin trước đây gửi `provinceId` là tên đầy đủ của tỉnh thành. Backend lưu vào DB as-is, dẫn đến:
- Query filter không match được
- Địa điểm không xuất hiện trong list

### Sử dụng

**Dry run (xem trước thay đổi, không update DB):**
```bash
cd services/trekking-service
node src/scripts/migrate-province-ids.js --dry-run
```

**Live run (áp dụng thay đổi vào DB):**
```bash
node src/scripts/migrate-province-ids.js
```

### Output mẫu

```
🔍 Province ID Migration Script
================================
Mode: DRY RUN (no changes)

Connecting to: mongodb://localhost:27017/trekvn
✅ Connected to MongoDB

📊 Found 15 places in database

🔧 Fix: "Núi Bà Đen"
   OLD: provinceId = "Tây Ninh"
   NEW: provinceId = "tay_ninh"
   ⏭️  Skipped (dry run)

🔧 Fix: "Fansipan"
   OLD: provinceId = "Lào Cai"
   NEW: provinceId = "lao_cai"
   ⏭️  Skipped (dry run)

📈 Migration Summary
===================
Total places:        15
Already correct:     10
Fixed:               5
Unknown/Skipped:     0

💡 Run without --dry-run to apply changes
```

### Requirements

- Node.js
- MongoDB connection (đọc từ `.env` file hoặc default localhost)
- Environment variables:
  - `MONGODB_URI` (optional, default: `mongodb://localhost:27017/trekvn`)

### Safety

- Script luôn chạy trong mode dry-run nếu có flag `--dry-run`
- Backup DB trước khi chạy live migration (khuyến nghị)
- Script chỉ update field `provinceId`, không động vào data khác
- Sử dụng atomic update operations

### Rollback

Nếu cần rollback, tạo một migration ngược lại hoặc restore từ backup.
