-- Curriculum v2: Book Buddy's education taxonomy (edu-taxonomy release) in the shared `trio` database.
--
-- Additive only. Creates taxonomy.node, node_type, allowed_child, combination, combination_class and release beside
-- the old taxonomy.taxonomy_nodes, which keeps working (and keeps serving /api/v1/taxonomy/*) until DigiClassroom and
-- PDLMS have switched. The 7,884 nodes are not in this file: Vidyaverse loads them at start-up from
-- prisma/taxonomy/edu-taxonomy when TAXONOMY_V2_ENABLED=true (src/modules/curriculum/loader.ts).
--
-- Apply once, as a superuser, before deploying the code that sets TAXONOMY_V2_ENABLED:
--   docker cp 001_curriculum_v2.sql <postgres-container>:/tmp/
--   docker exec <postgres-container> psql -U postgres -d trio -v ON_ERROR_STOP=1 -1 -f /tmp/001_curriculum_v2.sql
-- Running it a second time fails on the first CREATE TABLE and changes nothing (-1 = one transaction).
--
-- The structure rules are the ones Book Buddy's migration 20261012000000_taxonomy enforces, so a bug in any app cannot
-- write an orphaned or misplaced node.

CREATE SCHEMA IF NOT EXISTS taxonomy;

CREATE TABLE taxonomy.node_type (
    node_type TEXT PRIMARY KEY
);

CREATE TABLE taxonomy.allowed_child (
    parent_type TEXT NOT NULL REFERENCES taxonomy.node_type (node_type),
    child_type  TEXT NOT NULL REFERENCES taxonomy.node_type (node_type),
    PRIMARY KEY (parent_type, child_type)
);

CREATE TABLE taxonomy.node (
    id                UUID PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    parent_id         UUID REFERENCES taxonomy.node (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    depth             SMALLINT NOT NULL,
    sort_order        INTEGER NOT NULL,
    node_type         TEXT NOT NULL REFERENCES taxonomy.node_type (node_type),
    segment           TEXT NOT NULL,
    name              TEXT NOT NULL,
    name_hi           TEXT,
    canonical_subject TEXT,
    canonical_topic   TEXT,
    status            TEXT NOT NULL DEFAULT 'active',
    verification      TEXT NOT NULL DEFAULT 'sourced',
    completeness      TEXT NOT NULL DEFAULT 'complete',
    path              TEXT NOT NULL,
    attrs             JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT node_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_]*(\.[A-Z0-9][A-Z0-9_]*)*$'),
    CONSTRAINT node_depth_range CHECK (depth BETWEEN 1 AND 12),
    CONSTRAINT node_order_positive CHECK (sort_order >= 1),
    CONSTRAINT node_segment_format CHECK (segment ~ '^[A-Z0-9][A-Z0-9_]*$'),
    CONSTRAINT node_name_clean CHECK (name <> '' AND name = btrim(name)),
    CONSTRAINT node_canonical_subject_format CHECK (canonical_subject ~ '^[A-Z0-9_]+$'),
    CONSTRAINT node_canonical_topic_format CHECK (canonical_topic ~ '^[A-Z0-9_]+(\.[A-Z0-9_]+)+$'),
    CONSTRAINT node_status_values CHECK (status IN ('active', 'inactive')),
    CONSTRAINT node_verification_values CHECK (verification IN ('sourced', 'verify', 'template')),
    CONSTRAINT node_completeness_values CHECK (completeness IN ('complete', 'partial', 'pending')),
    CONSTRAINT node_root_is_domain CHECK ((parent_id IS NULL) = (node_type = 'DOMAIN')),
    CONSTRAINT node_root_depth CHECK ((parent_id IS NULL) = (depth = 1)),
    CONSTRAINT node_subject_has_canon CHECK (node_type <> 'SUBJECT' OR canonical_subject IS NOT NULL),
    CONSTRAINT node_topic_one_identity CHECK (
        node_type NOT IN ('SECTION', 'UNIT', 'TOPIC') OR ((canonical_subject IS NULL) <> (canonical_topic IS NULL))),
    CONSTRAINT node_identity_only_on_content CHECK (
        node_type IN ('SUBJECT', 'PAPER', 'SECTION', 'UNIT', 'TOPIC')
        OR (canonical_subject IS NULL AND canonical_topic IS NULL))
);

CREATE INDEX node_parent_id_idx ON taxonomy.node (parent_id);
CREATE INDEX node_node_type_idx ON taxonomy.node (node_type);
CREATE INDEX node_canonical_subject_idx ON taxonomy.node (canonical_subject);
CREATE INDEX node_canonical_topic_idx ON taxonomy.node (canonical_topic);
CREATE INDEX node_code_prefix_idx ON taxonomy.node (code text_pattern_ops);
CREATE INDEX node_attrs_gin ON taxonomy.node USING gin (attrs);

-- No two siblings may share a name (case-insensitive) or a sort position. Deferrable so a release can re-order
-- siblings in one transaction.
CREATE UNIQUE INDEX node_sibling_name_uq
    ON taxonomy.node (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
ALTER TABLE taxonomy.node ADD CONSTRAINT node_sibling_order_uq
    EXCLUDE USING btree (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, sort_order WITH =)
    DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE taxonomy.combination (
    code          TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    rule          TEXT NOT NULL DEFAULT 'guidance',
    compulsory    TEXT[] DEFAULT ARRAY[]::TEXT[],
    choose        JSONB NOT NULL DEFAULT '[]',
    language_rule TEXT
);

CREATE TABLE taxonomy.combination_class (
    combination_code TEXT NOT NULL REFERENCES taxonomy.combination (code) ON DELETE CASCADE ON UPDATE CASCADE,
    class_node_id    UUID NOT NULL REFERENCES taxonomy.node (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY (combination_code, class_node_id)
);

CREATE TABLE taxonomy.release (
    hash       TEXT PRIMARY KEY,
    version    TEXT NOT NULL,
    node_count INTEGER NOT NULL,
    loaded_at  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Structural integrity: allowed parent->child type, depth, code = parent.code + '.' + segment; id, code, segment,
-- parent and type immutable (deactivate and add instead).
CREATE FUNCTION taxonomy.node_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    p taxonomy.node%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id OR NEW.code <> OLD.code OR NEW.segment <> OLD.segment
           OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.node_type <> OLD.node_type THEN
            RAISE EXCEPTION 'taxonomy: id, code, segment, parent and node_type are immutable (node %). Mark it inactive and add a new node instead.', OLD.code;
        END IF;
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    IF NEW.parent_id IS NULL THEN
        IF NEW.code <> NEW.segment THEN
            RAISE EXCEPTION 'taxonomy: root code % must equal its segment', NEW.code;
        END IF;
        RETURN NEW;
    END IF;

    SELECT * INTO p FROM taxonomy.node WHERE id = NEW.parent_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'taxonomy: parent % not found', NEW.parent_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM taxonomy.allowed_child
                   WHERE parent_type = p.node_type AND child_type = NEW.node_type) THEN
        RAISE EXCEPTION 'taxonomy: % is not allowed under % (%)', NEW.node_type, p.node_type, p.code;
    END IF;
    IF NEW.depth <> p.depth + 1 THEN
        RAISE EXCEPTION 'taxonomy: depth of % must be %', NEW.code, p.depth + 1;
    END IF;
    IF NEW.code <> p.code || '.' || NEW.segment THEN
        RAISE EXCEPTION 'taxonomy: code % must be %.%', NEW.code, p.code, NEW.segment;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER node_guard_trg
    BEFORE INSERT OR UPDATE ON taxonomy.node
    FOR EACH ROW EXECUTE FUNCTION taxonomy.node_guard();

-- `path` is a display cache the database keeps right: an insert or a rename re-derives every node's path.
CREATE FUNCTION taxonomy.node_path_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    WITH RECURSIVE t AS (
        SELECT id, name::text AS p FROM taxonomy.node WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, t.p || ' > ' || c.name FROM taxonomy.node c JOIN t ON c.parent_id = t.id
    )
    UPDATE taxonomy.node n SET path = t.p FROM t WHERE n.id = t.id AND n.path <> t.p;
    RETURN NULL;
END $$;

CREATE TRIGGER node_path_sync_trg
    AFTER INSERT OR UPDATE OF name ON taxonomy.node
    FOR EACH STATEMENT EXECUTE FUNCTION taxonomy.node_path_sync();

-- The node types and which may sit under which. Generated from Book Buddy's generate_taxonomy.py.
INSERT INTO taxonomy.node_type (node_type) VALUES
  ('DOMAIN'), ('SUBDOMAIN'), ('PROGRAM'), ('SPECIALISATION'), ('CLASS'), ('EXAM'), ('LEVEL'), ('PERIOD'),
  ('STAGE'), ('GROUP'), ('MODULE'), ('PAPER'), ('SUBJECT'), ('SECTION'), ('UNIT'), ('TOPIC');

INSERT INTO taxonomy.allowed_child (parent_type, child_type) VALUES
  ('DOMAIN', 'SUBDOMAIN'),
  ('SUBDOMAIN', 'CLASS'), ('SUBDOMAIN', 'EXAM'), ('SUBDOMAIN', 'LEVEL'), ('SUBDOMAIN', 'PROGRAM'),
  ('PROGRAM', 'GROUP'), ('PROGRAM', 'LEVEL'), ('PROGRAM', 'MODULE'), ('PROGRAM', 'PERIOD'),
  ('PROGRAM', 'SPECIALISATION'), ('PROGRAM', 'SUBJECT'),
  ('SPECIALISATION', 'GROUP'), ('SPECIALISATION', 'PERIOD'), ('SPECIALISATION', 'SUBJECT'),
  ('CLASS', 'GROUP'), ('CLASS', 'SUBJECT'),
  ('EXAM', 'GROUP'), ('EXAM', 'PAPER'), ('EXAM', 'STAGE'), ('EXAM', 'SUBJECT'),
  ('LEVEL', 'GROUP'), ('LEVEL', 'MODULE'), ('LEVEL', 'PAPER'), ('LEVEL', 'SUBJECT'),
  ('PERIOD', 'GROUP'), ('PERIOD', 'SUBJECT'),
  ('STAGE', 'GROUP'), ('STAGE', 'PAPER'), ('STAGE', 'SUBJECT'),
  ('GROUP', 'PAPER'), ('GROUP', 'SUBJECT'),
  ('MODULE', 'PERIOD'), ('MODULE', 'SUBJECT'), ('MODULE', 'UNIT'),
  ('PAPER', 'SECTION'), ('PAPER', 'SUBJECT'), ('PAPER', 'UNIT'),
  ('SUBJECT', 'PAPER'), ('SUBJECT', 'SECTION'), ('SUBJECT', 'UNIT'),
  ('SECTION', 'UNIT'),
  ('UNIT', 'TOPIC');

-- Ownership and grants, as for the old taxonomy tables: taxonomy_app (Vidyaverse's TAXONOMY_DATABASE_URL) owns and
-- loads them; the other apps' roles may read. Skipped for roles that do not exist, so the file also runs on a bare
-- local database.
DO $$
DECLARE
    t TEXT;
    r TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxonomy_app') THEN
        FOREACH t IN ARRAY ARRAY['node_type', 'allowed_child', 'node', 'combination', 'combination_class', 'release'] LOOP
            EXECUTE format('ALTER TABLE taxonomy.%I OWNER TO taxonomy_app', t);
        END LOOP;
        ALTER FUNCTION taxonomy.node_guard() OWNER TO taxonomy_app;
        ALTER FUNCTION taxonomy.node_path_sync() OWNER TO taxonomy_app;
    END IF;
    FOREACH r IN ARRAY ARRAY['content_app', 'identity_app', 'vidyaverse_app', 'pdlms_app', 'digiclassroom_app'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA taxonomy TO %I', r);
            FOREACH t IN ARRAY ARRAY['node_type', 'allowed_child', 'node', 'combination', 'combination_class', 'release'] LOOP
                EXECUTE format('GRANT SELECT ON taxonomy.%I TO %I', t, r);
            END LOOP;
        END IF;
    END LOOP;
END $$;
