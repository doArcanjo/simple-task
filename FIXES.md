# How the simple version answers the Nasty Review

Every numbered finding from the review, and what this codebase does about it.

Resolutions: **FIXED** (done properly here) · **GONE** (the subsystem doesn't exist, so
the problem can't) · **DOCUMENTED** (kept as a deliberate, stated limitation in the
README) · **N/A** (the finding was about the original repo's documents or process, and
nothing of it was carried over).

## Wrong right now (1–11)

| # | Finding | Here |
|---|---|---|
| 1 | HANDOFF said 259 tests, reality 286 | **GONE** — there is no HANDOFF; the README quotes no test count, it says `npm test` and lets the runner report. |
| 2 | "Frontend has no automated tests" was stale | **N/A** — no claims doc exists to go stale. |
| 3 | "MVP7 untouched" was stale | **N/A** — no MVP ladder, no board. |
| 4 | Dead-export confession outlived the dead export | **N/A** — and no exported function here is without a caller. |
| 5 | "~25 lines each" auth claim was false | **GONE** — the README states no line counts. |
| 6 | "20 isolation tests" (real: 17) | **GONE** — no counted claims; the isolation suite exists and CI runs it. |
| 7 | "11 ADRs" (real: 12) | **GONE** — there are no ADR files to miscount; decisions are ten bullets in the README. |
| 8 | /stats listed as "stretch" though shipped | **GONE** — there is no /stats and no status-column API table; the README documents only what exists. |
| 9 | Placeholder sentence in Trade-offs | **FIXED** — the README's trade-offs section is finished prose. |
| 10 | No version anywhere | **FIXED** — package.json is 1.0.0 and `GET /health` returns `{ status, version }`. |
| 11 | wasLate timezone bug (UTC date vs local day) | **FIXED** — `shared/status.js` converts `completedAt` to the viewer's **local** calendar day before comparing (`localDay()`), with a comment naming the bug it prevents. |

## Too much project (12–26)

| # | Finding | Here |
|---|---|---|
| 12 | Two persistence engines | **GONE** — SQLite only, from hour one. No seam, no contract suite. |
| 13 | Two migration systems for self-inflicted schema churn | **GONE** — the schema is born at its final shape; there are zero migrations. |
| 14 | Telemetry stack for an ungraded need | **GONE** — no telemetry, no /stats, no NDJSON sink. |
| 15 | Rate limiter as a product | **FIXED** — one ~25-line fixed-window limiter on `/auth` only. |
| 16 | Connection dot state machine while Rename was a prompt() | **GONE/FIXED** — no connection dot; Rename is a real inline edit. |
| 17 | 7+ doc surfaces | **FIXED** — two documents: README.md and this file. |
| 18 | ~26% essay-comment density | **FIXED** — comments are sparse one-liners stating non-obvious constraints only. |
| 19 | Bespoke bash release pipeline | **GONE** — no tag gate, no review-trail, no kill-ports; `scripts/dev.js` is the one small convenience. |
| 20 | Python-grep in the tag gate | **GONE**. |
| 21 | ADR for a mostly-unbuilt snapshot scheme | **GONE** — nothing is documented that doesn't exist. |
| 22 | Config knob for a fake delay | **GONE** — the sample assistant answers immediately. |
| 23 | Auth gold-plating (decoy, rehash, NFKC) while localStorage stays | **FIXED by trade** — those three are dropped and named in README limitations; the saved effort went to user-visible auth: confirm-password, change-password, delete-account. |
| 24 | Ceremony-heavy git history | **N/A** — fresh directory; commit normally. |
| 25 | Four tool configs + second entry | **FIXED** — Vite and vitest only; no Biome, no Playwright, no styleguide entry. |
| 26 | Styleguide page as scope | **GONE**. |

## Frontend UX (27–41)

| # | Finding | Here |
|---|---|---|
| 27 | Rename via window.prompt() | **FIXED** — inline rename (Enter saves, Escape cancels). |
| 28 | Edit task via prompt() | **FIXED** — an edit dialog with title, multi-line description and date. |
| 29 | No delete confirmation | **FIXED** — deleting a project or task opens a confirm dialog that says what will be lost. |
| 30 | title in API but not in the form | **FIXED** — the create form and the edit dialog both have a title field. |
| 31 | 500 chars in a single-line input | **FIXED** — description is a `<textarea>` with a live character counter; multi-line is legal end to end. |
| 32 | No loading states | **FIXED** — list loads show a hint; buttons disable while in flight. |
| 33 | Full re-render loses focus/scroll | **FIXED** — Vue keyed rendering updates in place. |
| 34 | One overwriting global error banner | **FIXED** — field errors sit next to their fields; server outcomes are toasts. |
| 35 | No success feedback | **FIXED** — polite toasts on create/rename/complete/delete. |
| 36 | Session expiry discards typed work | **FIXED** — on a 401 the draft is parked in sessionStorage and restored after the next login. |
| 37 | Focus lost after Add task | **FIXED** — focus returns to the title field. |
| 38 | No confirm-password / show-password; no reset | **FIXED (partly)** — confirm + show/hide exist and password *change* exists; password *reset* (email flow) is still out of scope and listed in limitations. |
| 39 | Mobile untested/unstyled | **FIXED** — responsive single-column layout under 700px, 44px touch targets. |
| 40 | "mock assistant" developer wording | **FIXED** — the UI says "sample assistant". |
| 41 | Empty states sell nothing | **FIXED** — empty states nudge toward creating a project and trying Suggest. |

## Security (42–56)

| # | Finding | Here |
|---|---|---|
| 42 | Token in localStorage | **DOCUMENTED** — same deliberate trade, stated in README with the httpOnly-cookie fix named. |
| 43 | No revocation | **DOCUMENTED** — logout stays client-side; account deletion *does* kill tokens instantly (the gate re-checks the user exists). |
| 44 | No per-account lockout | **DOCUMENTED** — the per-IP limit remains the only brake; named limitation. |
| 45 | No password reset | **DOCUMENTED**, and softened: change-password and delete-account now exist, so a known password has a full lifecycle; recovery of a lost one still doesn't. |
| 46 | scrypt below OWASP floor | **DOCUMENTED** — same deliberate 2¹⁵ constant, same reasoning, in the README. |
| 47 | /stats public recon | **GONE** — no /stats. |
| 48 | /health fingerprinting | **FIXED** — /health returns status and version only. |
| 49 | CSP unsafe-inline | **FIXED** — the CSP has no `unsafe-inline`; Vite extracts all component CSS into a real stylesheet. |
| 50 | No aud/iss/jti in JWT | **DOCUMENTED** — single service, single secret; noted. |
| 51 | req.ip with no trust proxy | **FIXED** — `TRUST_PROXY=true` env wires Express's `trust proxy`; the README says when to set it. |
| 52 | Unlimited junk registration | **DOCUMENTED** — registration shares the 10/min/IP budget; email verification named as the real fix. |
| 53 | No data quotas; O(n) JSON writes | **GONE/DOCUMENTED** — SQLite writes are row-level (no O(n) rewrite); per-user quotas remain unenforced and are listed. |
| 54 | Login password had no max length | **FIXED** — `loginInput` caps at 200 like registration (shape-only validation otherwise preserved). |
| 55 | Decoy at top-level await; drift risk | **GONE** — no decoy; the resulting timing difference on unknown emails is a *stated* limitation instead of a mitigated one. |
| 56 | No account deletion / GDPR erasure | **FIXED** — `DELETE /api/account` (password-confirmed) erases the user and cascades; tests prove the token dies with it. |

## Backend & code (57–71)

| # | Finding | Here |
|---|---|---|
| 57 | Positional owner-first args as a security property | **REDUCED** — still positional (plain JS), but there is exactly one store implementation and every task query joins projects in SQL; the WHERE clause, not argument discipline, carries isolation. Named in README. |
| 58 | Store divergence on `title: ""` | **GONE** — one store, one behaviour; zod still rejects empty strings first. |
| 59 | Ids differ between stores | **GONE** — one store. |
| 60 | Re-migrating + cloning the whole doc per request | **GONE** — no document store, no migrate-on-read. |
| 61 | Server-domain vocabulary in the browser bundle | **FIXED** — the web imports only `shared/schemas.js` (input schemas) and `shared/status.js`; no user/passwordHash schema exists in shared. |
| 62 | No request correlation | **DOCUMENTED** — out of scope for this size; named. |
| 63 | Two overlapping request timers | **GONE** — neither exists. |
| 64 | Shutdown can hang; stream never closed | **FIXED** — SIGINT/SIGTERM close with a 5-second force-exit timeout; the DB handle is closed; there is no telemetry stream. |
| 65 | 404 reflects the request path | **FIXED** — the 404 body is a constant sentence. |
| 66 | updateUserPassword unguarded at the seam | **FIXED** — password change is an authenticated route requiring the current password; the db function is only reachable through it. |
| 67 | Stale-token first visit says "session ended" | **FIXED** — that message appears only when a session was actually live in this tab. |
| 68 | No types/JSDoc despite argument-order risk | **DOCUMENTED** — plain JS kept for size; TypeScript named as the first thing a longer-lived version adopts. |
| 69 | Config mutable by convention | **ACCEPTED** — same convention, far fewer knobs; not worth a freeze in ~40 lines of config. |
| 70 | fit() amputates mid-thought | **REDUCED** — the sample assistant composes within the cap instead of trimming after; a cap-trim remains as the last resort. |
| 71 | Email normalization in four places | **FIXED** — normalized in the zod schema once; the DB's `COLLATE NOCASE` unique index is the single backstop, and that pairing is a one-line comment. |

## Testing (72–81)

| # | Finding | Here |
|---|---|---|
| 72 | Frontend logic untested | **PARTLY** — status/schema logic the UI leans on lives in `shared/` and is unit-tested; Vue components remain browser-verified only, stated in README. |
| 73 | One happy-path smoke | **GONE** — no Playwright at all here; the trade (no e2e vs no e2e *pretending* coverage) is stated. |
| 74 | Store-equivalence never automated | **GONE** — one store. |
| 75 | No CI | **FIXED** — `.github/workflows/ci.yml`: npm ci, test, build on every push/PR. |
| 76 | Unreproducible timing measurement | **GONE** — no timing claims are made anywhere. |
| 77 | No load test on O(n) writes | **GONE** — no O(n) write path. |
| 78 | Limiter never raced | **PARTLY** — the fixed window is synchronous per process; tests cover boundary and reset with a fake clock. |
| 79 | /stats privacy asserted not tested | **GONE**. |
| 80 | One-off mutation testing | **N/A** — suite written fresh; no deleted-test claims to defend. |
| 81 | No coverage wiring | **DOCUMENTED** — `vitest run --coverage` works out of the box if wanted; not wired into CI to keep it quick. |
| 89* | Test fixtures beside runtime data | **FIXED** — tests run entirely on `:memory:` databases; nothing touches `data/`. |

## Ops & delivery (82–91)

| # | Finding | Here |
|---|---|---|
| 82 | No Dockerfile | **FIXED** — one-stage Dockerfile; build, prune, volume for /data, JWT_SECRET required at runtime. |
| 83 | /meta documented but absent | **GONE** — nothing documented that doesn't exist. |
| 84 | Undemonstrated Postgres claim | **GONE** — no swappability claims are made. |
| 85 | No seed script | **FIXED** — `npm run seed` creates demo@demo.dev / demo1234 with tasks in every state (pending, due, overdue, completed on time, completed late). |
| 86 | No screenshot in README | **FIXED** — the README opens with one (docs/screenshot.png). |
| 87 | Env docs in two drifting places | **FIXED** — `.env.example` is the single env reference; the README links to it instead of restating it. |
| 88 | Unstructured logs | **DOCUMENTED** — console logging kept; named. |
| 90 | Port-killing dev script | **FIXED** — `scripts/dev.js` spawns and cleans up only its own children; it never kills by port. |
| 91 | Retrospective PRs optics | **N/A** — fresh tree, normal git use. |

## Product (92–100)

| # | Finding | Here |
|---|---|---|
| 92 | User has no lifecycle | **FIXED (mostly)** — change password and delete account exist; change email remains out (limitation). |
| 93 | Whose midnight is "overdue"? | **FIXED** — all day math is explicitly the browser's local day (shared/status.js), and the row tooltip shows the date in the viewer's locale. |
| 94 | No i18n | **DOCUMENTED** — English-only, named. |
| 95 | role="toolbar" promising unimplemented keys | **FIXED** — filters are plain buttons with `aria-pressed`; no promise is made that isn't kept. |
| 96 | Suggest could never send a title | **FIXED** — the form has a title field and Suggest sends whatever of title/description is filled. |
| 97 | Completion time rounded away | **FIXED** — completed rows show date *and* time in the viewer's locale. |
| 98 | Status recomputed per render | **ACCEPTED** — Vue's computed caching does the memoizing; trivial at this scale. |
| 99 | No data export | **FIXED** — `GET /api/export` + an Export button that downloads your own data as JSON. |
| 100 | README leads with prose, not proof | **FIXED** — the README's first screen is: screenshot, three bullets, one run command. |

\* finding 89 belongs to the ops section in the review; listed under testing here because its fix is a test-design choice.
