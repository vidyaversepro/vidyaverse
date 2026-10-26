# Learning path: one onboarding in all four apps

What a learner is studying, asked once at onboarding and kept the same way in Vidyaverse, DigiClassroom,
PDLMS and Book Buddy (library hub plan v2, Part D / Phase 6).

## The flow

1. Account (sign up or sign in; Google, email or Vidyaverse).
2. **Learner, or invited staff.** Staff (teachers, librarians, admins) were invited by an institution:
   they confirm their name and go to their dashboard. Nothing below is asked of them.
3. **On my own, or with an institution.** With an institution, the learner joins it (or is already a
   student there); their class's curriculum node becomes their main goal automatically.
4. **What are you studying?** One main goal from curriculum v2 (Book Buddy's taxonomy): a board's
   class, a programme, an exam course. Class 11-12 adds the stream. "I'm just exploring" is allowed.
5. **Medium**: the language they study in (`en`, `hi`).
6. **More goals** (optional): up to three more (a Class 12 PCM student also preparing for JEE Main).

## The shape (identical in every app)

```
GET  -> { prompt, skipped, medium,
          goals: [{ nodeId, isPrimary, code, name, nodeType, path, verification, gradeLevel,
                    combination: { code, name } | null, source: 'self' | 'institution' }],
          legacy: { board, gradeLevel, stream, medium } }
PUT  <- { goals: [{ nodeId, isPrimary?, combinationCode? }], medium?: 'en' | 'hi' | null, skip?: boolean }
```

- Goal node types: `CLASS, PROGRAM, SPECIALISATION, PERIOD, LEVEL, EXAM`. Never a subject or a domain.
- At most 4 goals; one is primary (the first marked, else the first listed).
- `prompt` is true until the learner has a goal or chose "just exploring".
- `legacy` is derived from the main goal, never asked: `board` = the school board segment of the code
  (`SCH.CBSE.C9` -> `CBSE`, null outside school), `gradeLevel` = the class's grade, `stream` = the
  combination code, `medium` as chosen. Older code (DigiClassroom's board/class/stream, PDLMS's and Book
  Buddy's `gradeLevel`) reads these.
- An institutional student's class node (set by the institution on the class, with each stream's code)
  comes first as an `institution` goal they cannot remove; their own goals are extras.

## Where it is stored

| App | Store | Endpoint |
|---|---|---|
| Vidyaverse | `learner_goals`, `users.preferred_medium`, `users.learning_path_skipped_at`, `classes.curriculum_node_id`, `streams.combination_code` | `GET/PUT /api/v1/academic/my-learning-path` (session or OIDC bearer token) |
| DigiClassroom, PDLMS | their own copy, same shape | their own `/api/.../learning-path`; for a learner signed in with Vidyaverse, read from and written to Vidyaverse, the local copy kept as a cache |
| Book Buddy | `UserLearningGoal` + `User.preferredMedium` | `GET/PUT /api/user/learning-path` (its own accounts) |

Most production accounts in DigiClassroom and PDLMS are Google or email accounts, not Vidyaverse ones
(Oct 2026), so each app must keep its own copy; Vidyaverse is the shared copy for federated learners.

## Admin

`PUT /api/v1/class/:id/curriculum { nodeId | null, streams: [{ streamId, combinationCode | null }] }`
(main_admin, school_admin; the class must be the admin's institution's). UI: Institution -> Academics ->
select a class -> "Curriculum taught in ...".
