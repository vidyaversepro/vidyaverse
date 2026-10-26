# edu-taxonomy 2026.10.1 (vendored)

Book Buddy's education taxonomy: 7884 nodes, 122 stream combinations.
Ids are `id = uuid5(id_namespace, code)` with namespace `bfd0d89e-223c-53fa-8476-1b70678a5d20`, so every app that loads this
release has the same id for the same code.

**Do not edit these files.** They are hash-checked: `node verify-release.mjs` exits 1 when any byte differs from
RELEASE.json. A new release is cut in Book Buddy (`backend/prisma/taxonomy`) and copied here with
`node scripts/vendor-taxonomy.mjs <this folder>` from a Book Buddy checkout. See CHANGELOG.md.
