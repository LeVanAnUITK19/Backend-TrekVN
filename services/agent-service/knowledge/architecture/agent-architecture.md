---
title: TrekViet Agent Service Architecture
category: architecture
active: true
---

# Agent Service Architecture

## Overview

Agent Service là Python FastAPI service cung cấp 3 tính năng chính:
1. **AI Assistant** — chat Q&A cho Admin
2. **Place Builder** — AI tìm và chuẩn bị dữ liệu địa điểm
3. **Map Builder** — tạo offline map (MBTiles) tự động

## AI Assistant

```
Admin chat message
    │
    ▼
AssistantService.send_message()
    │
    ├── load conversation history (MongoDB)
    │
    ├── build LLM context:
    │   [system_prompt, ...history, new_user_msg]
    │
    ├── tool dispatch:
    │   ├── detect tool calls in LLM response
    │   ├── execute tools (Knowledge or Production API)
    │   └── inject results back to LLM
    │
    ├── LLM call (UIT / Groq / OpenAI)
    │
    └── persist & return assistant message
```

### Tool Categories

**Knowledge Tools** (static docs):
- `list_knowledge_documents` — danh sách tài liệu
- `search_knowledge` — tìm kiếm trong docs
- `read_knowledge_document` — đọc doc theo ID

**Production Read Tools** (live API):
- `search_places`, `get_place`, `get_routes_by_place`, `get_route`
- `get_milestones`, `get_place_reviews`
- `get_badges`, `get_contributions`
- `get_provinces`, `get_checkin_statistics`, `get_place_visit_statistics`
- `search_users`, `get_user_summary`, `get_user_statistics`
- `get_ranks`, `get_rank_distribution`
- `get_system_overview`

**Agent Draft Tools** (write to agent DB, NOT production):
- Gamification change requests
- Place Builder candidates (reviewed before production push)

### Permission Boundaries

```
Knowledge read        → ALLOW
Production GET        → ALLOW
Production analytics  → ALLOW
Agent DB draft write  → ALLOW

Knowledge write       → DENY
Arbitrary filesystem  → DENY
Production direct DB  → DENY
Production POST/PUT   → DENY (except after approval workflow)
Arbitrary HTTP URL    → DENY (SSRF protection)
```

## Place Builder

```
Admin input: placeName + locationHint
    │
    ▼
PlaceBuilderService
    ├── OSM lookup (overpass-api)
    ├── Wikidata enrichment
    ├── Web crawler
    ├── Duplicate check (trekking-service)
    ├── Normalize + validate
    └── Save PlaceCandidate to agent MongoDB

Admin review → APPROVE/REJECT
    │ APPROVE
    ▼
TrekkingServiceClient.create_place() (authenticated)
    → POST /admin/trekking/places
```

## Map Builder

```
Admin input: trekkingPlaceId + bbox + zoom
    │
    ▼
MapBuilderService
    ├── Validate bbox
    ├── Extract OSM data (Overpass)
    ├── Build MBTiles (tiling pipeline)
    ├── Package ZIP
    └── Save MapJob to agent MongoDB

Admin review → APPROVE
    │ APPROVE
    ▼
R2Client.upload()
    → Cloudflare R2
    ▼
TrekkingServiceClient.update_route_offline_map()
    → PUT /admin/trekking/routes/:id/offline-map
```

## LLM Providers

Priority order (configurable): `uit` → `groq` → `openai`

- `auto` mode: fallback through priority list
- Manual mode: fail hard if provider unavailable

## MongoDB (agent-service)

Collections:
- `conversations` — chat histories
- `messages` — individual messages
- `agent_runs` — execution audit log (TTL: 90 days)
- `place_candidates` — Place Builder queue
- `map_jobs` — Map Builder queue
- `workflow_events` — step-level audit (TTL: 30 days)
