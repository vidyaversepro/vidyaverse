# taxonomy migrations

SQL for the `taxonomy` schema of the shared **`trio`** database. Prisma does not run these: the `trio` database has
no migrations ledger (DigiClassroom's `packages/core/src/lib/db/trio-migrations/README.md` explains why), so they are
applied by hand, as a superuser, and **this table is the ledger**. Update the Applied column in the same commit that
applies a file.

```bash
# from the VPS
docker cp 001_curriculum_v2.sql <postgres-container>:/tmp/
docker exec <postgres-container> psql -U postgres -d trio -v ON_ERROR_STOP=1 -1 -f /tmp/001_curriculum_v2.sql
```

The schema's older tables (`taxonomy_nodes`, `content_taxonomy_link`) predate this folder; their DDL is in
DigiClassroom's `000_baseline_20260807.sql` snapshot.

| File | What it is | Applied to prod |
|---|---|---|
| `001_curriculum_v2.sql` | Curriculum v2: `taxonomy.node`, `node_type`, `allowed_child`, `combination`, `combination_class`, `release` in Book Buddy's shape, with its guard and path triggers, owned by `taxonomy_app`, readable by the other app roles. Additive: the old tree keeps serving `/api/v1/taxonomy/*`. The nodes themselves are loaded by the API from `../edu-taxonomy` when `TAXONOMY_V2_ENABLED=true`. | no |

## Turning curriculum v2 on

1. Apply `001_curriculum_v2.sql` (above).
2. Deploy the backend with `TAXONOMY_V2_ENABLED=true`. `TAXONOMY_DATABASE_URL` must connect as `taxonomy_app` (the
   loader writes the tables), and `TAXONOMY_SERVICE_API_KEY` is the key DigiClassroom and PDLMS already send.
3. The first start logs `[curriculum] edu-taxonomy 2026.10.1 loaded: 7884 nodes`; later starts log `already loaded`.
   Check: `select version, node_count from taxonomy.release;` and `GET /api/v1/curriculum/domains` with the
   `x-taxonomy-api-key` header (7 domains).
4. Only then switch DigiClassroom and PDLMS to it (their own `TAXONOMY_V2_ENABLED`).

`TAXONOMY_AUTOLOAD=0` skips the load at start-up; `TAXONOMY_DATA_DIR` points it at another release folder.

## A new taxonomy release

Cut it in Book Buddy, then from a Book Buddy checkout:

```bash
node scripts/vendor-taxonomy.mjs "<vidyaverse>/backend/prisma/taxonomy/edu-taxonomy"
```

Deploying the new files is enough: the loader sees a new release hash, updates labels in place, makes nodes that left
the file inactive (never deletes them) and replaces the combinations. Update the pinned ids and the Book Buddy
responses in `src/modules/curriculum/__tests__/` if the release changed them.
