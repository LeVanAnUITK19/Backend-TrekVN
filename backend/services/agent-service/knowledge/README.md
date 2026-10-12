---
title: TrekViet Agent Knowledge Base
category: meta
active: true
---

# TrekViet Agent Knowledge Base

Thư mục này chứa tài liệu nội bộ dành cho AI Assistant đọc và tham chiếu.

## Cấu trúc

```
knowledge/
├── srs/                  # Software Requirements Specification
│   └── trek-viet-srs-v4.md
├── database/             # Database schema (DBML)
│   ├── trek-viet-trekking.dbml
│   ├── trek-viet-auth.dbml
│   ├── trek-viet-checkin.dbml
│   ├── trek-viet-community.dbml
│   └── trek-viet-agent.dbml
├── api/                  # API documentation
│   ├── trekking-service-api.md
│   ├── checkin-service-api.md
│   └── auth-service-api.md
├── architecture/         # Architecture documentation
│   ├── microservices.md
│   ├── offline-first.md
│   └── agent-architecture.md
├── business-rules/       # Business rules
│   ├── journey.md
│   ├── gamification.md
│   └── badge.md
└── README.md

```

## Quy tắc sử dụng

- **Câu hỏi về thiết kế, kiến trúc, DB schema, API contract** → dùng tài liệu trong `knowledge/`
- **Câu hỏi về dữ liệu thực tế, số lượng hiện tại, trạng thái hệ thống** → dùng Production GET APIs
- **Kiểm tra so sánh thiết kế với thực tế** → kết hợp cả hai nguồn

## Document IDs

| documentId | Nội dung |
|-----------|----------|
| `srs/trek-viet-srs-v4` | SRS phiên bản 4 |
| `database/trek-viet-trekking` | Schema trekking service |
| `database/trek-viet-auth` | Schema auth service |
| `database/trek-viet-checkin` | Schema checkin service |
| `database/trek-viet-community` | Schema community service |
| `database/trek-viet-agent` | Schema agent service |
| `api/trekking-service-api` | Trekking Service API docs |
| `api/checkin-service-api` | CheckIn Service API docs |
| `api/auth-service-api` | Auth Service API docs |
| `architecture/microservices` | Kiến trúc microservices |
| `architecture/offline-first` | Kiến trúc offline-first |
| `architecture/agent-architecture` | Kiến trúc agent service |
| `business-rules/journey` | Business rules: Journey |
| `business-rules/gamification` | Business rules: Gamification/XP |
| `business-rules/badge` | Business rules: Badge |
