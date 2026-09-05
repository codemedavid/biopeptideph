# Access Gate — Software Requirements Specification

Companion to [`group-buy-srs.md`](./group-buy-srs.md). Scope: **the access-code gate and admin login only.**

**Read this before the Group Buy spec's §10.** The two subsystems have *opposite* security postures, and that contradiction is the most important fact in the codebase. See §16.

**[ASSUMPTION]** marks inference, not observed code.

---

## 1. Product Concept

The site is **private by default.** A visitor cannot see the storefront at all until they enter a shared **access code**. This is a single shared secret for the whole site — not per-user accounts. Think "password-protected shop," not "login."

Two independent privilege levels ride on the same cookie:

| Level | Secret | Source of truth | Grants |
|---|---|---|---|
| **Visitor** | shared access code | `app_settings.access_code_hash` (bcrypt, in DB) | see the storefront |
| **Admin** | admin password | `ADMIN_PASSWORD` env var | dashboard + admin data proxy |

They are **not hierarchical.** `requireAdmin` checks `session.isAdmin` and never checks `session.authed`; `requireValidSession` checks `authed` and never checks `isAdmin`. An admin login produces a session with *only* `{isAdmin: true}` — it does not grant visitor access, and vice versa. **[ASSUMPTION]** this is incidental rather than designed, since `adminLogin` overwrites `req.session` wholesale rather than merging. An admin who logs in from a fresh browser gets the dashboard but would still hit the access gate on the storefront.

Three invariants:

1. **The access code never reaches the browser's JavaScript.** It's bcrypt-hashed in the DB, compared server-side, and the result lives only in an httpOnly cookie.
2. **Sessions are stateless signed cookies.** No session table, no server-side store, no pooler dependency — chosen deliberately for serverless.
3. **Rotating the code logs everyone out**, globally, via `code_version`. This is the *only* revocation mechanism that exists.

---

## 2. User Journey

### 2.1 Visitor

| Stage | Detail |
|---|---|
| **Entry point** | Any URL. `<AccessGate>` swaps the entire app for the code page when unauthed |
| **Actions** | Type the access code into a single `type="password"` field → submit |
| **Decision points** | None. One field, one button |
| **Outputs** | httpOnly `dg.sid` cookie, 15-minute rolling session |
| **Next step** | The real app renders. Activity silently extends the session |
| **Failure** | Wrong code → *"Invalid access code"*; 11th attempt in 15 min → *"Too many attempts. Please wait a few minutes and try again."* |

The session is **rolling, not fixed**: 15 minutes of *inactivity* ends it, not 15 minutes of use. `AccessContext` pings `/api/session` on click/keydown/mousemove/scroll/touchstart, throttled to **once per 60s**, plus a forced re-check when the tab becomes visible again (it may have idled past expiry while backgrounded). When the server says the session is gone, state flips to `unauthed` and the gate reappears mid-session — no reload needed.

### 2.2 Admin

| Stage | Detail |
|---|---|
| **Entry point** | Admin dashboard route |
| **Actions** | Enter admin password → dashboard → optionally rotate the site access code |
| **Decision points** | Whether to rotate the code (which kicks out every active visitor) |
| **Outputs** | `{isAdmin: true}` session; on rotation, a bumped `code_version` |
| **Next step** | Distribute the new code out-of-band **[ASSUMPTION]** — no delivery mechanism exists in the product |

**Rotation is authorized by the admin session cookie alone.** The browser never sends the old code or any secret. The new code must be **≥ 6 characters**, hashed with **bcrypt cost 12**, and the version bump invalidates every outstanding visitor cookie on their next request.

---

## 3. Complete Workflow

### 3.1 Visitor authentication

```
POST /api/access/verify   { code }
  ├─ rate limit: 10 / 15 min / IP  → 429 { error: 'too_many_attempts' }
  ├─ body ≤ 8kb; code must be a string, non-empty → 400 { error: 'code_required' }
  ├─ db.getSettings() → { access_code_hash, code_version }
  ├─ bcrypt.compare(code, hash)   → false: 401 { error: 'invalid_code' }
  ├─ session = { authed: true, codeVersion: settings.code_version }
  ├─ saveSession() → Set-Cookie dg.sid (httpOnly, sameSite=lax, secure when HTTPS, 15min)
  └─ 200 { authenticated: true }
```

```
GET /api/session          (heartbeat / rolling refresh)
  ├─ rate limit: 60 / min / IP
  ├─ requireValidSession:
  │    ├─ !session.authed                        → 401 { error: 'unauthenticated' }
  │    ├─ session.codeVersion !== db version     → clearSession, 401 { session_invalidated }
  │    └─ db error                               → 500 { server_error }
  ├─ saveSession()  ← slides the idle window forward
  └─ 200 { authenticated: true }
```

### 3.2 Admin authentication

```
POST /api/admin/login     { password }
  ├─ rate limit: 20 / 15 min / IP
  ├─ ADMIN_PASSWORD unset                → 500 { error: 'not_configured' }
  ├─ safeEqual(password, ADMIN_PASSWORD) → false: 401 { error: 'invalid_password' }
  ├─ session = { isAdmin: true }         ← NOTE: replaces, does not merge
  └─ 200 { ok: true }

GET  /api/admin/session   → { admin: bool }, rolling refresh when true
POST /api/admin/logout    → clearSession, { ok: true }
```

`ADMIN_PASSWORD` is compared **in plaintext against an env var** — no hash, no DB. Only the *visitor* code is bcrypt'd.

### 3.3 Code rotation

```
POST /api/admin/access-code   { newCode }
  ├─ rate limit: 20 / 15 min / IP
  ├─ requireAdmin: session.isAdmin OR Bearer ADMIN_API_KEY (constant-time)
  │                                       → else 403 { error: 'forbidden' }
  ├─ newCode.length < 6                   → 400 { error: 'code_too_short' }
  ├─ bcrypt.hash(newCode, 12)
  ├─ db.updateAccessCode(hash) → bumps code_version, returns it
  └─ 200 { ok: true, codeVersion }

Effect: every live visitor cookie carries the OLD codeVersion. Their next
/api/session hits the mismatch branch → cookie cleared → gate reappears.
```

### 3.4 Session mechanics (`cookieSession.js`)

```
Cookie value = base64url(JSON payload) + "." + HMAC-SHA256(body, SESSION_SECRET)

decode(raw):
  split at LAST '.'                    ← lastIndexOf, so base64url body is safe
  timing-safe compare sig vs recomputed HMAC  → mismatch: null
  parse JSON; require numeric payload.exp
  Date.now() > payload.exp             → null (expired)
  else → payload

saveSession():  strip old exp → set exp = now + 15min → re-sign → Set-Cookie
clearSession(): session = {} → clearCookie
```

Cookie flags: `httpOnly`, `sameSite: 'lax'`, `secure: req.secure` (Express derives it from `trust proxy: 1` behind Vercel), `maxAge: 15min`, `path: '/'`.

**The tamper story:** the payload is signed, not encrypted — it is *readable* by anyone with the cookie, but not *modifiable*. Flipping `isAdmin` to true breaks the HMAC and the whole session decodes to `{}`. The `exp` is inside the signed payload, so it cannot be extended client-side even though the browser also holds a `maxAge`.

**The trade-off, documented in the source:** individual sessions **cannot be revoked server-side.** A leaked visitor cookie is valid until it idles out or the admin rotates the code (nuking everyone). A leaked *admin* cookie is valid until it idles out and **cannot be revoked at all** — `code_version` doesn't apply to admin sessions, and `/api/admin/logout` only clears the attacker's own cookie, not theirs. See §12.

---

## 4. Feature Breakdown

### 4.1 Shared access code

- **Purpose:** keep the whole storefront private.
- **Backend:** `app_settings` single row; bcrypt compare in the Express app.
- **Data:** `access_code_hash`, `code_version`.
- **Edge cases:** no code format rules beyond ≥6 chars on *rotation* — the initial seed (`scripts/set-access-code.js`) is unconstrained. No expiry, no per-visitor codes, no usage tracking. **[ASSUMPTION]** the code is shared out-of-band (chat/DM) — nothing in the product distributes it.

### 4.2 Stateless signed sessions

- **Purpose:** auth that survives serverless cold starts with zero DB dependency.
- **User value:** invisible — but it's why login works when the Postgres pooler is unreachable.
- **Backend:** HMAC-SHA256 over a base64url JSON payload.
- **Edge cases:** `SESSION_SECRET` rotation invalidates **every** session instantly (all signatures fail) — an emergency kill switch, and a deploy hazard if the env var differs between environments. The app **fails fast at boot** if `SESSION_SECRET` is unset, with a message telling you how to generate one.

### 4.3 Global invalidation via `code_version`

- **Purpose:** the revocation mechanism a stateless design would otherwise lack.
- **Logic:** session carries the version it was minted under; `requireValidSession` compares against the DB on every check.
- **Edge cases:** costs one `getSettings()` DB read per heartbeat (60 req/min/IP limit). Only covers **visitor** sessions — admin sessions carry no version and are unaffected by rotation.

### 4.4 Admin data proxy

- **Purpose:** keep orders and assessment PII off the public anon key.
- **Routes:** `GET /api/admin/orders` (optional `group_buy_id` filter — this is what the GB report calls), `PATCH /api/admin/orders/:id`, `DELETE`, `POST /bulk-delete`, `GET /api/admin/assessment-responses`.
- **Backend:** service-role data layer (`supabaseDb` over HTTPS by default, or `pgDb` direct Postgres).
- **Edge cases:** `PATCH` uses a **strict allowlist** — only `order_status` and `payment_status` are writable; anything else is silently dropped and an empty patch returns `400 no_fields`. Returns `404` when zero rows change.

### 4.5 Two-key admin authorization

`requireAdmin` accepts **either** the session cookie **or** `Authorization: Bearer <ADMIN_API_KEY>`, compared with `safeEqual`. The Bearer path exists for scripts (`scripts/e2e-admin.mjs`). **[ASSUMPTION]** it's a test/automation affordance; note it's a second standing credential with full admin rights and no expiry.

### 4.6 Constant-time comparison

`safeEqual` **SHA-256s both sides to a fixed 32 bytes first**, then `timingSafeEqual`. This is deliberate and correct: comparing raw strings would throw or short-circuit on a length mismatch, leaking the secret's length via timing. Preserve this in a clone — the hash-first step is the non-obvious part.

### 4.7 SPA-fallback defense (client)

Both `verifyCode` and `adminLogin` refuse to accept a `2xx` unless the JSON body is genuinely `{authenticated: true}` / `{ok: true}`. A misrouted `/api` returning the SPA's `index.html` is a `200` — without this check, a broken rewrite or a local dev server with no backend would **grant admin access to anyone.** This is a real, subtle failure mode. Keep it.

---

## 5. Database Design

```sql
app_settings (
  id               integer PRIMARY KEY DEFAULT 1,
  access_code_hash text NOT NULL,          -- bcrypt, cost 12
  code_version     integer NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)   -- enforces exactly one row
)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- NO POLICIES = no anon/authenticated access whatsoever.
-- The DATABASE_URL / service-role backend bypasses RLS. This is correct.
```

The `CHECK (id = 1)` + `DEFAULT 1` is a clean single-row-table idiom — a second insert fails on the PK, not silently duplicating config.

**`db/access_gate.sql` also defines a `session` table** (connect-pg-simple DDL). **It is dead.** The app moved to stateless cookies and no code reads it. Do not port it. **[ASSUMPTION]** it's a leftover from a pre-serverless iteration; it's worth deleting from the SQL file to avoid misleading the next reader.

**Session payload** (in the cookie, not the DB):

```
Visitor: { authed: true, codeVersion: <int>, exp: <epoch ms> }
Admin:   { isAdmin: true,                    exp: <epoch ms> }
```

**Environment variables:**

| Var | Purpose | Missing behavior |
|---|---|---|
| `SESSION_SECRET` | signs cookies | **boot failure** with a generate-one-with-this message |
| `ADMIN_PASSWORD` | admin login | `500 not_configured` (surfaced distinctly in the UI) |
| `ADMIN_API_KEY` | Bearer admin auth | Bearer path disabled; session path still works |
| `DATABASE_URL` / Supabase service key | data layer | routes 500 |

---

## 6. Automation Flow

```
VISITOR LOGIN
Trigger    submit access code
Validation rate limit (10/15min) → string, non-empty → bcrypt.compare
Processing mint { authed, codeVersion }
Storage    NONE server-side — signed httpOnly cookie only
AI         none
Feedback   app renders, or inline error (invalid / too many attempts)
```

```
HEARTBEAT
Trigger    user activity (click/key/mouse/scroll/touch), throttled 60s;
           plus forced re-check on tab visible
Validation authed? codeVersion still current?
Processing re-sign cookie with a new exp (rolling)
Feedback   silent on success; gate reappears on failure
```

```
CODE ROTATION
Trigger    admin submits new code
Validation admin session OR Bearer key → length ≥ 6
Processing bcrypt.hash(cost 12) → updateAccessCode → code_version++
Storage    app_settings
Feedback   admin sees new version; EVERY visitor is logged out on next heartbeat
```

**No scheduled tasks, no queues, no webhooks, no notifications.** Expiry is passive (`exp` in the payload). Nothing cleans up anything — there's nothing to clean up, which is the point of the stateless design.

---

## 7. AI Prompts

**None. Zero AI in this flow** — same as Group Buy. Auth is exact-comparison logic; a model has no place in it.

---

## 8. API Requirements

| Endpoint | Method | Inputs | Outputs | Auth | Rate limit |
|---|---|---|---|---|---|
| `/api/access/verify` | POST | `{code}` | `{authenticated:true}` / 401 / 429 | none | 10 / 15min |
| `/api/session` | GET | — | `{authenticated:true}` / 401 | visitor cookie | 60 / min |
| `/api/logout` | POST | — | `{ok:true}` | none | — |
| `/api/admin/login` | POST | `{password}` | `{ok:true}` / 401 / 500 `not_configured` | none | 20 / 15min |
| `/api/admin/session` | GET | — | `{admin:bool}` | — | 60 / min |
| `/api/admin/logout` | POST | — | `{ok:true}` | — | 20 / 15min |
| `/api/admin/access-code` | POST | `{newCode}` | `{ok:true, codeVersion}` / 403 / 400 | **admin** | 20 / 15min |
| `/api/admin/orders` | GET | `?group_buy_id=` | `{orders}` | **admin** | 60 / min |
| `/api/admin/orders/:id` | PATCH | `{order_status?, payment_status?}` | `{ok:true}` / 404 / 400 | **admin** | 20 / 15min |
| `/api/admin/orders/:id` | DELETE | — | `{ok:true}` | **admin** | 20 / 15min |
| `/api/admin/orders/bulk-delete` | POST | `{ids[]}` | `{ok:true}` / 400 | **admin** | 20 / 15min |
| `/api/admin/assessment-responses` | GET | — | `{responses}` | **admin** | 60 / min |
| `/api/health` | GET | — | `{status}` | none | — |

All responses JSON. Unmatched → `404 {error:'not_found'}`. Body limit **8kb**. `helmet()` with `contentSecurityPolicy: false` (**[ASSUMPTION]** disabled because the SPA needs inline styles — a real CSP with a nonce is the correct fix; see the global web security rules).

Every client call sends `credentials: 'include'`.

---

## 9. Frontend Components

- **`AccessProvider`** (`AccessContext.tsx`) — `status: loading | authed | unauthed`, `refresh()`, `logout()`; owns the throttled heartbeat and visibility listener
- **`<AccessGate>`** — swaps the entire app for the code page when unauthed
- **`AccessCodePage.tsx`** — single `type="password"` field (placeholder *"Access code"*), submit button, inline error text
- **`<ProtectedRoute>`** — route-level guard
- **`AccessCodePanel.tsx`** (admin) — rotate the code
- **`accessApi.ts`** — typed client; discriminated-union results (`{ok:true}` | `{ok:false, reason}`), never throws

Loading state matters: `status` starts `'loading'`, so the app must not flash the gate before the first `checkSession()` resolves.

---

## 10. Backend Services & Permissions

**Service:** one Express app (`createApp({ db })`), deployed as a Vercel function, built as a **factory taking an injected `db`** so it unit-tests without a live database (`tests/access-gate.test.mjs`). Data layer is swappable: `supabaseDb` (service-role over HTTPS, the default — **no pooler**) or `pgDb` (direct Postgres).

**Why the HTTPS default matters:** memory records that direct `DATABASE_URL` connections failed because Supabase resolves **IPv6-only**. The Supabase-over-HTTPS layer sidesteps it entirely. If a clone's login mysteriously fails locally, check that before anything else — along with the absence of a local `/api` proxy.

**Roles:** *Anonymous* (may hit verify/login/health only) · *Visitor* (`authed`) · *Admin* (`isAdmin` cookie, or Bearer `ADMIN_API_KEY`). Not hierarchical (§1).

**Jobs / queues / webhooks / cron: none.**

---

## 11. State Machines

**Visitor session:**

```
   ┌───────────┐  checkSession() pending
   │  loading  │
   └─────┬─────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────┐  correct code   ┌────────┐
│unauthed│  │  authed  │◄────────────────│ (gate) │
└────────┘  └────┬─────┘                 └────────┘
    ▲            │ activity → saveSession (rolling 15min)
    │            │
    └────────────┴── 15min idle │ code rotated (version mismatch)
                                │ logout │ SESSION_SECRET rotated
```

**Admin session:** `anonymous → isAdmin` (correct password) `→ anonymous` (logout or 15min idle). **Unaffected by code rotation.**

**Access code:** `seeded (v1) → rotated (v2) → rotated (v3) …` — monotonic; every bump invalidates all visitor sessions minted under prior versions.

---

## 12. Error Handling

**Validation:** code must be a non-empty string (400); new code ≥6 chars (400); order patch must contain an allowlisted field (400); bulk delete needs a non-empty string array (400).

**Failures:** every route wraps in try/catch, logs server-side with a short message, and returns a **generic** `500 {error:'server_error'}` — internals never reach the client. The one deliberate exception is `not_configured`, distinguished so the UI doesn't tell an operator to set `ADMIN_PASSWORD` when it's already set.

**Retry logic: none.** Client calls return `{ok:false, reason}` and the user retries. Rate limiting makes automated retry counterproductive by design.

**User messages:** *"Invalid access code"* · *"Too many attempts. Please wait a few minutes and try again."* · a distinct not-configured message · logout swallows network errors (dropping to `unauthed` locally is the safe outcome).

**Known gaps to fix in a clone:**

| # | Issue | Impact |
|---|---|---|
| 1 | Admin sessions have no `codeVersion` equivalent | A leaked admin cookie **cannot be revoked** — only `SESSION_SECRET` rotation kills it, which logs out everyone |
| 2 | `ADMIN_PASSWORD` compared as plaintext env var | No hash, no rotation path, no lockout beyond the IP limiter |
| 3 | Rate limits are **per-IP** | Distributed guessing bypasses them; no per-account lockout exists |
| 4 | `ADMIN_API_KEY` is a standing credential | Full admin, no expiry, no audit |
| 5 | `contentSecurityPolicy: false` | No CSP protection on an app that renders admin data |
| 6 | Dead `session` table in `db/access_gate.sql` | Misleads the next implementer |
| 7 | No audit log | Code rotations and admin logins leave no trail |

---

## 13. Technical Architecture

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite; Context for auth state |
| Backend | **Express**, deployed as a Vercel serverless function (`api/index.js`) |
| Session | Custom stateless signed cookie (HMAC-SHA256) — **not** express-session |
| Hashing | bcryptjs — cost 12 (access code only) |
| Hardening | helmet (CSP off), express-rate-limit, 8kb body cap, `trust proxy: 1` |
| Database | Postgres/Supabase; `app_settings` locked by RLS-with-no-policies |
| Data layer | `supabaseDb` (service-role HTTPS, default) or `pgDb` (direct) — injected |
| AI providers | None |
| Local dev | `scripts/dev-api.mjs`; seed via `scripts/set-access-code.js` |

---

## 14. Build Plan

**Phase 1 — MVP:** `app_settings` + RLS-no-policies · `cookieSession` · `/access/verify` + `/session` + `/logout` · `AccessProvider` + `<AccessGate>` + code page · rate limiting · seed script.

**Phase 2 — Admin:** `/admin/login` + `/admin/session` + `/admin/logout` · code rotation with `code_version` bump · `AccessCodePanel` · admin data proxy with the PATCH allowlist.

**Phase 3 — Hardening (mostly missing today):** hash `ADMIN_PASSWORD` and move it to the DB · per-admin `sessionVersion` for revocable admin sessions · audit log for logins and rotations · real CSP with nonces · **[ASSUMPTION]** per-visitor codes with issue/revoke, if the operator ever needs to know *who* is inside.

---

## 15. Cursor AI Build Instructions

### Database

```sql
CREATE TABLE app_settings (
  id               integer PRIMARY KEY DEFAULT 1,
  access_code_hash text NOT NULL,
  code_version     integer NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;  -- no policies, on purpose

-- FIX 1: make admin sessions revocable (the reference cannot do this).
ALTER TABLE app_settings ADD COLUMN admin_password_hash text;
ALTER TABLE app_settings ADD COLUMN admin_session_version integer NOT NULL DEFAULT 1;

-- FIX 2: audit trail (absent in the reference).
CREATE TABLE auth_audit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event      text NOT NULL,     -- code_rotated | admin_login | admin_login_failed
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Do not create a `session` table.** The reference ships one; it is dead code.

### Backend

Port `createApp({ db })` as a **factory with an injected data layer** — this is what makes it testable without a database. Keep every one of these:

- `safeEqual` — **SHA-256 both sides first**, then `timingSafeEqual`. Not optional; raw comparison leaks length.
- Fail fast at boot if `SESSION_SECRET` is missing, with the generate command in the message.
- `trust proxy: 1`, 8kb body limit, rate limits at 10/15min (verify), 20/15min (admin), 60/min (session).
- `requireValidSession` comparing `session.codeVersion` to the DB on every check.
- The PATCH allowlist (`order_status`, `payment_status` only) → `400 no_fields` when empty, `404` when zero rows change.
- Generic `500 server_error` everywhere, except the deliberate `not_configured`.

Change these:

- **Hash `ADMIN_PASSWORD`** (bcrypt 12) into `app_settings.admin_password_hash`; keep the env var only as a bootstrap seed.
- **Add `adminSessionVersion` to the admin session payload** and check it in `requireAdmin`, so a leaked admin cookie can be revoked without nuking `SESSION_SECRET`.
- **Merge, don't replace**, on `adminLogin`: `req.session = { ...req.session, isAdmin: true }` — otherwise logging in as admin silently drops the visitor's `authed` flag. **[ASSUMPTION]** the reference's wholesale replacement is a latent bug, not a design choice.
- **Enable a real CSP** with per-request nonces instead of `contentSecurityPolicy: false`.
- **Write an `auth_audit` row** on every rotation and admin login (success and failure).
- Gate `ADMIN_API_KEY` behind an explicit env flag so it can't be left on in production by accident.

### Session module

Port `cookieSession.js` as-is. The details that matter: split at `lastIndexOf('.')` (base64url bodies contain no `.`, but be explicit), timing-safe signature compare, `exp` **inside** the signed payload, strip-then-reset `exp` on every save, and `secure: req.secure`.

### Frontend

```
src/
├── context/AccessContext.tsx        # status + throttled heartbeat + visibility
├── components/access/
│   ├── AccessGate.tsx               # swaps the app when unauthed
│   └── ProtectedRoute.tsx
├── pages/AccessCodePage.tsx
├── components/admin/AccessCodePanel.tsx
└── lib/accessApi.ts                 # discriminated unions, never throws
```

**The SPA-fallback check is mandatory.** Never treat a `2xx` as success unless the body is literally `{authenticated: true}` / `{ok: true}`. A misrouted `/api` returns the SPA's HTML with a `200` — without this, a bad rewrite grants admin to anyone.

Heartbeat: 60s throttle, `{passive: true}` listeners, forced re-check on `visibilitychange`. Start `status` at `'loading'` so the gate never flashes.

### Business rules (non-negotiable)

1. The access code never reaches client JS — bcrypt in the DB, compared server-side, result in an httpOnly cookie.
2. `app_settings` is RLS-locked with **no policies**; only the service-role backend touches it.
3. Sessions are stateless signed cookies. No session table.
4. Rotating the code bumps `code_version` and logs out every visitor.
5. New codes ≥ 6 chars, bcrypt cost 12.
6. 15-minute **rolling idle** timeout, `exp` inside the signed payload.
7. Rotation is authorized by the admin **session**, never by a secret from the browser.
8. Admin order writes are allowlisted to `order_status` and `payment_status`.
9. Errors are generic to the client, detailed in server logs.
10. No AI in this flow.

### Development order

1. `app_settings` + RLS + seed script
2. `cookieSession` — **test signature tampering and expiry first**; it's pure and it's the trust boundary
3. `createApp` factory + injected db + `SESSION_SECRET` boot check
4. `/access/verify` + `/session` + `/logout` + rate limits
5. `AccessProvider` + `<AccessGate>` + code page
6. Heartbeat + visibility re-check
7. `/admin/login` + hashed password + `adminSessionVersion`
8. Rotation + `code_version` bump + audit rows
9. Admin data proxy + PATCH allowlist
10. CSP with nonces

Port `tests/access-gate.test.mjs` — it exercises the factory against a fake db and encodes the rate-limit and version-mismatch behavior.

---

## 16. Relationship to Group Buy — read this

**The two subsystems contradict each other, and the Group Buy side is the wrong one.**

The access gate is genuinely well-built: bcrypt, RLS-with-no-policies so the hash is unreachable via the API, constant-time comparison, rate limiting, httpOnly signed cookies, a service-role proxy specifically so orders and assessment PII never touch the anon key.

Group Buy throws that away. `group_buys` and `group_buy_product_availability` are `USING (true) WITH CHECK (true)` **for anon, read and write.** The GB admin runs on the public anon key behind a client-side password check — it never calls the Express app that exists precisely to prevent this. So:

> **Anyone who gets past the shared access code — or who simply reads the anon key out of the JS bundle, which requires no code at all — can create, activate, and delete Group Buy rounds directly against PostgREST.**

The access gate does not protect the database. It protects the *page*. The anon key is in the client bundle either way.

**Two coherent options for the clone. Pick one; do not ship the current hybrid:**

1. **Extend the proxy (recommended).** Route GB writes through the Express app behind `requireAdmin`, exactly like `/api/admin/orders` already is. Then lock the GB tables to `SELECT`-only for anon. The pattern already exists in this codebase — GB just doesn't use it.
2. **Real Supabase Auth.** Issue admin JWTs and write RLS policies against `auth.jwt()`, per `group-buy-srs.md` §15 FIX 2. More work, and it duplicates an auth system that already functions.

Option 1 reuses what's built and working. `listOrders({ groupBuyId })` — the call the GB report depends on — is *already* behind `requireAdmin`. The report path is protected; the round-management path is not. Closing that gap is a handful of routes, not an architecture change.
