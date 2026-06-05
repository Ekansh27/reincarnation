# Butterbase schema

Create these three tables in your Butterbase app (dashboard.butterbase.ai → your app
→ Tables, or via the Butterbase MCP). The `@butterbase/sdk` data client authenticates
with the **anon key**, so set Row-Level Security policies as noted.

### `commentators`
| column          | type      | notes                              |
|-----------------|-----------|------------------------------------|
| id              | uuid (pk) | default gen                        |
| slug            | text      | unique                             |
| name            | text      |                                    |
| sport           | text      |                                    |
| xtrace_group_id | text      | filled by the seed script (nullable) |

RLS: **public read**, public insert (seed writes once).

### `iconic_moments`
| column               | type      | notes      |
|----------------------|-----------|------------|
| id                   | uuid (pk) | default gen |
| slug                 | text      | unique     |
| title                | text      |            |
| year                 | int       |            |
| original_commentator | text      |            |
| original_line        | text      |            |
| context              | text      |            |

RLS: **public read**, public insert (seed writes once).

### `generated_clips`  (write-only log; optional)
| column             | type      | notes |
|--------------------|-----------|-------|
| id                 | uuid (pk) | default gen |
| created_at         | timestamptz | default now() |
| user_handle        | text      |       |
| query              | text      |       |
| target_commentator | text      |       |
| matched_moment     | text      |       |
| script_text        | text      |       |

RLS: **public insert**. (Logging is best-effort and never blocks a reply.)
