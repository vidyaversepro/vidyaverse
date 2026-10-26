#!/usr/bin/env node
/**
 * Checks an `edu-taxonomy` release folder against its RELEASE.json, and cuts a new RELEASE.json.
 *
 *   node scripts/check-taxonomy-release.mjs [dir]                 exit 1 when anything differs
 *   node scripts/check-taxonomy-release.mjs --cut <version> [dir] writes RELEASE.json for the files in dir
 *
 * `dir` defaults to backend/prisma/taxonomy/data, or to this script's own folder when it sits inside a vendored
 * copy (vendor-taxonomy.mjs copies it there as verify-release.mjs). Node built-ins only, so the copy runs in any repo.
 *
 * What it checks: each file's sha256 and size, the node count, that every id is uuid5(id_namespace, code), and the
 * release hash (the same one Book Buddy's loader records in TaxonomyRelease, so two apps can tell they hold the
 * same release).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_NAME = 'edu-taxonomy';
export const DATA_FILES = ['taxonomy_nodes.csv', 'combinations.json'];
const NODE_HEADER = 'id,code,parent_id,parent_code,depth,sort_order,node_type,segment,name,name_hi,'
  + 'canonical_subject,canonical_topic,status,verification,completeness,path,attrs';

const here = dirname(fileURLToPath(import.meta.url));

export function defaultDir() {
  if (existsSync(join(here, 'RELEASE.json'))) return here;
  return resolve(here, '..', 'backend', 'prisma', 'taxonomy', 'data');
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** sha256(nodes, NUL, combinations): equal to releaseHash() in backend/src/curriculum/taxonomy-data.ts. */
export function releaseHash(csvBuf, combosBuf) {
  return createHash('sha256').update(csvBuf).update(Buffer.from([0])).update(combosBuf).digest('hex');
}

/** RFC 4122 version-5 UUID. */
export function uuidV5(namespace, name) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4180 rows; a leading byte-order mark is dropped. */
function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readData(dir) {
  const [csvBuf, combosBuf] = DATA_FILES.map((f) => readFileSync(join(dir, f)));
  const [header, ...rows] = parseCsv(csvBuf.toString('utf8'));
  if (header?.join(',') !== NODE_HEADER) throw new Error(`taxonomy_nodes.csv: unexpected header`);
  const combos = JSON.parse(combosBuf.toString('utf8'));
  return { csvBuf, combosBuf, rows, combos };
}

/** Every problem with the folder, or none. */
export function verifyRelease(dir) {
  const problems = [];
  const releasePath = join(dir, 'RELEASE.json');
  if (!existsSync(releasePath)) return { problems: [`${releasePath} is missing`], release: null };
  let release;
  try {
    release = JSON.parse(readFileSync(releasePath, 'utf8'));
  } catch (e) {
    return { problems: [`RELEASE.json is not valid JSON: ${e.message}`], release: null };
  }
  if (release.name !== RELEASE_NAME) problems.push(`RELEASE.json names "${release.name}", expected "${RELEASE_NAME}"`);
  for (const f of DATA_FILES) {
    const want = release.files?.[f];
    if (!want) { problems.push(`RELEASE.json has no entry for ${f}`); continue; }
    if (!existsSync(join(dir, f))) { problems.push(`${f} is missing`); continue; }
    const buf = readFileSync(join(dir, f));
    if (buf.length !== want.bytes) problems.push(`${f}: ${buf.length} bytes, RELEASE.json says ${want.bytes}`);
    const got = sha256(buf);
    if (got !== want.sha256) problems.push(`${f}: sha256 ${got} differs from RELEASE.json ${want.sha256}`);
  }
  if (problems.length) return { problems, release };

  let data;
  try {
    data = readData(dir);
  } catch (e) {
    return { problems: [e.message], release };
  }
  if (data.rows.length !== release.node_count) {
    problems.push(`${data.rows.length} nodes, RELEASE.json says ${release.node_count}`);
  }
  const combos = data.combos.combinations ?? [];
  if (combos.length !== release.combination_count) {
    problems.push(`${combos.length} combinations, RELEASE.json says ${release.combination_count}`);
  }
  const wrongIds = data.rows.filter((r) => uuidV5(release.id_namespace, r[1]) !== r[0]);
  if (wrongIds.length) {
    problems.push(`${wrongIds.length} ids are not uuid5(id_namespace, code), first: ${wrongIds[0][1]}`);
  }
  const hash = releaseHash(data.csvBuf, data.combosBuf);
  if (hash !== release.release_hash) problems.push(`release hash ${hash} differs from RELEASE.json ${release.release_hash}`);
  return { problems, release };
}

/** Writes RELEASE.json describing the files as they are now. */
export function cutRelease(dir, version, { idNamespace, released = new Date().toISOString().slice(0, 10) } = {}) {
  if (!/^\d{4}\.\d{2}\.\d+$/.test(version)) throw new Error(`version must look like YYYY.MM.N, got "${version}"`);
  const { csvBuf, combosBuf, rows, combos } = readData(dir);
  const ns = idNamespace ?? existingNamespace(dir);
  if (!ns) throw new Error('the id namespace is unknown: pass --namespace <uuid> on the first cut');
  const release = {
    name: RELEASE_NAME,
    version,
    released,
    source: 'book-buddy007/bookbuddy: backend/prisma/taxonomy/generator/generate_taxonomy.py',
    schema_version: combos.schema_version ?? null,
    id_namespace: ns,
    id_rule: 'id = uuid5(id_namespace, code)',
    node_count: rows.length,
    combination_count: (combos.combinations ?? []).length,
    release_hash: releaseHash(csvBuf, combosBuf),
    files: Object.fromEntries(
      [[DATA_FILES[0], csvBuf], [DATA_FILES[1], combosBuf]].map(([f, buf]) => [f, { sha256: sha256(buf), bytes: buf.length }]),
    ),
  };
  writeFileSync(join(dir, 'RELEASE.json'), `${JSON.stringify(release, null, 2)}\n`);
  const { problems } = verifyRelease(dir);
  if (problems.length) throw new Error(`the release just cut does not verify: ${problems.join('; ')}`);
  return release;
}

function existingNamespace(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'RELEASE.json'), 'utf8')).id_namespace ?? null;
  } catch {
    return null;
  }
}

function main(argv) {
  const args = [...argv];
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const cut = take('--cut');
  const namespace = take('--namespace');
  const dir = resolve(args[0] ?? defaultDir());
  if (cut) {
    const r = cutRelease(dir, cut, { idNamespace: namespace });
    console.log(`${r.name} ${r.version}: ${r.node_count} nodes, release hash ${r.release_hash}`);
    return 0;
  }
  const { problems, release } = verifyRelease(dir);
  if (problems.length) {
    console.error(`taxonomy release in ${dir} does not match RELEASE.json:`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${release.name} ${release.version}: ${release.node_count} nodes, hashes match (${dir})`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
