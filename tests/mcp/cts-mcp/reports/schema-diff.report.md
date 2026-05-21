# Schema Diff Report — cts-mcp

- **Probed**: 2026-05-08T10:56:40.744Z
- **PRD**: docs/CTS MCP V1.0 - PRD Final.md
- **Server**: https://mcp-cts-test.ciwork.cn/mcp (mcp-cts-server v1.0.0)

## 概览

| 严重度 | 数量 |
|-------|:---:|
| 🔴 Critical | 8 |
| 🟡 Warn     | 15 |
| 🔵 Info     | 0 |

## 🔴 Critical

### 1. tool:cts_search_candidates.location.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 2. tool:cts_search_candidates.education.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 3. tool:cts_search_candidates.school_type.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 4. tool:cts_search_candidates.work_experience.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 5. tool:cts_search_candidates.industry.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 6. tool:cts_search_candidates.job_category.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 7. tool:cts_search_candidates.job_status.type
- Field type mismatch.
- **Expected**: `"string"`
- **Actual**: `"array"`

### 8. tool:cts_get_cts_schema.schema_type
- Field declared in PRD not found on server.

## 🟡 Warn

### 1. tool:cts_search_candidates.annotations.title
- Title mismatch.
- **Expected**: `"Talent Search"`
- **Actual**: `"Get Cts Search Candidates"`

### 2. tool:cts_search_candidates.active_within.enum
- Enum values mismatch.
- **Expected**: `["近7天","近30天","近90天"]`
- **Actual**: `["今日活跃","近3天","近7天","近15天","近30天"]`

### 3. tool:cts_search_candidates.trace_id
- Server exposes field not declared in PRD.
- **Actual**: `"trace_id"`

### 4. tool:cts_search_candidates.user_query
- Server exposes field not declared in PRD.
- **Actual**: `"user_query"`

### 5. tool:cts_get_candidate_detail.annotations.title
- Title mismatch.
- **Expected**: `"Talent Resume Detail"`
- **Actual**: `"Get Cts Candidate Detail"`

### 6. tool:cts_get_candidate_detail.trace_id
- Server exposes field not declared in PRD.
- **Actual**: `"trace_id"`

### 7. tool:cts_get_candidate_contact_info.annotations.title
- Title mismatch.
- **Expected**: `"Talent Contact Info"`
- **Actual**: `"Get Cts Candidate Contact Info"`

### 8. tool:cts_get_candidate_contact_info.trace_id
- Server exposes field not declared in PRD.
- **Actual**: `"trace_id"`

### 9. tool:cts_get_cts_schema.annotations.title
- Title mismatch.
- **Expected**: `"Data Dictionary"`
- **Actual**: `"Get Cts Data Dictionary"`

### 10. tool:cts_get_cts_schema.schema_types
- Server exposes field not declared in PRD.
- **Actual**: `"schema_types"`

### 11. tool:cts_get_cts_schema.queries
- Server exposes field not declared in PRD.
- **Actual**: `"queries"`

### 12. tool:cts_get_cts_schema.trace_id
- Server exposes field not declared in PRD.
- **Actual**: `"trace_id"`

### 13. capabilities.tools.listChanged
- PRD declares listChanged=true but server does not declare it.
- **Expected**: `true`

### 14. capabilities.logging
- PRD says logging not enabled but server declares it.
- **Expected**: `false`
- **Actual**: `{}`

### 15. capabilities.completions
- PRD says completions not enabled but server declares it.
- **Expected**: `false`
- **Actual**: `{}`
