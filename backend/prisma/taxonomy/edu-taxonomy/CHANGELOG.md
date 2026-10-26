# edu-taxonomy changelog

A release is the two data files (`taxonomy_nodes.csv`, `combinations.json`) plus `RELEASE.json`, which records each
file's sha256 and size, the node count, the id namespace and the release hash. Other repositories vendor a release
with `scripts/vendor-taxonomy.mjs` and check it with `verify-release.mjs`; nobody edits a vendored copy.

Versions are `YYYY.MM.N`. Codes and ids never change once released: a node that goes away is marked inactive by the
loaders, never deleted, and a renamed concept gets a new node beside the old one.

## 2026.10.1 (2026-10-26)

First release, cut from `generate_taxonomy.py` as committed on `main` at `164b01a` (the generator reproduces both
files byte for byte; `validate_taxonomy.py`: 0 errors, 0 warnings). Schema version 1.0.0.

- 7,884 nodes in 7 domains: School Education (3,376), Competitive Exams (2,263), Higher Education (916),
  Entrance Exams (647), Skill Development Courses (494), Professional Courses (160), Virat Gurukul (28).
- 122 stream / subject combinations (PCM, PCB, Commerce...) for Classes 11 and 12.
- Verification: 2,218 `sourced`, 2,532 `verify`, 3,134 `template` (mostly the state boards). Pickers show a badge
  for the last two.
- Id namespace `bfd0d89e-223c-53fa-8476-1b70678a5d20` (`uuid5(NAMESPACE_URL, "urn:edu-taxonomy:india:v1")`).
