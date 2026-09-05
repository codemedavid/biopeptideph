# Port Prompt — Access Gate + Group Buy → multi-tenant SaaS

**How to use this file:** paste everything below the line into a Claude session **in your SaaS repo**. It is self-contained — that Claude cannot see the DiamondGlow codebase, so every rule it needs is written out here.

**Two things to know before you paste:**

1. This supersedes the June access-gate design (per-tenant codes). Same architecture, now with Group Buy included and using one `tenants` table for both.
2. It **deliberately does not copy** the original's Group Buy security model. The original lets the browser write directly to the database with a public key. That worked for one operator; it would let any tenant edit any other tenant's rounds. Every Group Buy write goes through a server route here.

---

# TASK

Build two subsystems into this multi-tenant Next.js (App Router) + Supabase SaaS: a **per-tenant access gate** and a **per-tenant Group Buy** (preorder rounds). Both are ported from a working single-tenant app. The proven parts are specified exactly — implement them as written. Where this prompt says "FIX," it is deliberately correcting the original; do not revert to the original behavior.

## Context: what these things are

**Access gate** — each tenant's site is private. Visitors enter a shared **access code** (one per tenant, not per user) before seeing anything. Separately, each tenant has an **admin password** for their dashboard. Think "password-protected shop," not user accounts.

**Group Buy** — a preorder *round*. A tenant admin opens a round, assigns products to it, customers order during the window, admin closes it, then downloads a spreadsheet telling them how many units to order from the supplier.

**Group Buy is NOT a threshold group buy.** There is no MOQ, no "12 of 20 joined," no progress bar. It is a scheduled ordering window. Do not add threshold mechanics.

---

## 1. Database schema

Everything is tenant-scoped. Hashes live in a service-role-only table and never reach the browser.

```sql
-- ── Tenants: one row per client site. RLS ON with NO policies, on purpose:
-- anon/authenticated get nothing. Only the service-role key (which bypasses
-- RLS) reads this. That is what keeps the hashes unreachable via the API.
CREATE TABLE tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,          -- 'acme' → /s/acme
  name                  text NOT NULL,
  access_code_hash      text NOT NULL,                 -- bcrypt cost 12
  code_version          integer NOT NULL DEFAULT 1,
  admin_password_hash   text NOT NULL,                 -- bcrypt cost 12
  admin_session_version integer NOT NULL DEFAULT 1,
  logo_url              text,
  brand_color           text,
  gate_heading          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;   -- no policies. Correct.

-- ── Group Buy rounds
CREATE TABLE group_buys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gb_number   text NOT NULL,        -- FREE TEXT label: "5", "Mini GB", "Holiday Round"
  title       text NOT NULL,
  description text,
  start_date  timestamptz,
  end_date    timestamptz,
  status      text NOT NULL DEFAULT 'upcoming'
              CHECK (status IN ('upcoming','active','closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_buys_tenant_idx ON group_buys(tenant_id, status);

-- CRITICAL: exactly one active round PER TENANT, enforced by the database.
-- The original enforced this with a client-side loop and it is a real race.
CREATE UNIQUE INDEX group_buys_one_active_per_tenant
  ON group_buys(tenant_id) WHERE status = 'active';

-- ── Per-round product availability.
-- Sparse override table: NO ROW = AVAILABLE. Only rows turning something OFF
-- need to exist. This lets a product be on in one round and off in another
-- without touching its global availability flag.
CREATE TABLE group_buy_product_availability (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_buy_id uuid NOT NULL REFERENCES group_buys(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_buy_id, product_id)
);
CREATE INDEX gb_avail_gb_idx ON group_buy_product_availability(group_buy_id);

-- ── Wire Group Buy into your existing products/orders tables
ALTER TABLE products ADD COLUMN group_buy_id uuid
  REFERENCES group_buys(id) ON DELETE SET NULL;
CREATE INDEX products_group_buy_id_idx ON products(group_buy_id);

ALTER TABLE orders ADD COLUMN group_buy_id uuid
  REFERENCES group_buys(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN group_buy_number text;   -- SNAPSHOT, see rule 5
CREATE INDEX orders_group_buy_id_idx ON orders(group_buy_id);

-- ── Per-tenant setting: how an OFF product appears. 'hide' | 'disable'
CREATE TABLE tenant_settings (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key       text NOT NULL,
  value     text NOT NULL,
  PRIMARY KEY (tenant_id, key)
);
-- seed: ('<tenant>', 'gb_unavailable_behavior', 'hide')

-- ── Audit trail (the original has none)
CREATE TABLE auth_audit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  event      text NOT NULL,   -- code_rotated | admin_login | admin_login_failed
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**RLS on `group_buys` and `group_buy_product_availability`:** `SELECT` only, scoped to the tenant, for anon. **No anon INSERT/UPDATE/DELETE — ever.** All writes go through server route handlers using the service-role key. (The original allowed anon writes with `USING (true)`; that is the single worst thing in it and the main reason this port exists.)

**Do NOT create a `session` table.** Sessions are stateless signed cookies (§3). The original ships a session table left over from an earlier design; it is dead code.

---

## 2. Tenant resolution

Resolve the tenant from **path** (`/s/acme/...`) unless wildcard DNS and a wildcard domain are already configured on Vercel — then subdomain (`acme.yoursaas.com`) is fine. Path-based is the default recommendation because it needs no DNS work.

Resolve once in `middleware.ts`, pass the tenant id/slug down. Every query, every session check, every route is tenant-scoped. There is no global state anywhere.

---

## 3. Sessions — stateless signed cookies

No session table, no server-side store. The whole session is an HMAC-signed cookie. This is deliberate: it survives serverless cold starts and removes any database dependency from auth.

```
cookie value = base64url(JSON payload) + "." + HMAC-SHA256(body, SESSION_SECRET)

Visitor payload: { tenantId, authed: true,  codeVersion: <int>, exp: <epoch ms> }
Admin payload:   { tenantId, isAdmin: true, adminSessionVersion: <int>, exp: <epoch ms> }
```

Cookie flags: `httpOnly`, `sameSite: 'lax'`, `secure` in production, `maxAge` 15 min, `path: '/'`.

**Decode rules (implement exactly):**
- Split the raw value at the **last** `.` — the body is base64url and contains none, but be explicit.
- Compare signatures with a **timing-safe** comparison. Mismatch → treat the whole session as empty.
- `exp` must be a number **inside the signed payload**; `Date.now() > exp` → reject. It lives inside the signature so a client cannot extend it, even though the browser also holds a `maxAge`.
- On every save: strip the old `exp`, set `exp = now + 15min`, re-sign. This is what makes the timeout **rolling** (15 min of *inactivity*, not of use).

**Tenant isolation — the rule that matters most:** every validation checks **`session.tenantId === resolvedTenant.id`** AND `session.codeVersion === tenant.code_version`. Without the first check, a cookie minted for tenant A unlocks tenant B. Never skip it.

**Where crypto runs:** verify the HMAC in `middleware.ts` using **Web Crypto** (edge-compatible). **bcrypt runs only in Node route handlers, never in middleware** — it will not work there. Middleware exempts `/api`, `/_next`, static assets, and `/admin` (admin self-authenticates).

**Known trade-off, accept it consciously:** stateless means individual sessions cannot be revoked. Global revocation is covered — `code_version` for visitors, `admin_session_version` for admins. Rotating `SESSION_SECRET` kills everything everywhere (emergency only).

---

## 4. Route handlers

Mirror these exactly. All JSON. Body limit 8kb. Rate limits are per-IP **per-tenant**.

| Route | Method | Body | Success | Failures | Auth | Limit |
|---|---|---|---|---|---|---|
| `/api/access/verify` | POST | `{code}` | `{authenticated:true}` | 400 `code_required`, 401 `invalid_code`, 429 | none | 10/15min |
| `/api/session` | GET | — | `{authenticated:true}` | 401 `unauthenticated`, 401 `session_invalidated` | visitor | 60/min |
| `/api/logout` | POST | — | `{ok:true}` | — | none | — |
| `/api/admin/login` | POST | `{password}` | `{ok:true}` | 401 `invalid_password`, 429 | none | 20/15min |
| `/api/admin/session` | GET | — | `{admin:bool}` | — | — | 60/min |
| `/api/admin/logout` | POST | — | `{ok:true}` | — | — | 20/15min |
| `/api/admin/access-code` | POST | `{newCode}` | `{ok:true, codeVersion}` | 400 `code_too_short`, 403 | **admin** | 20/15min |
| `/api/group-buys` | GET | — | `{groupBuys}` | — | public (tenant) | 60/min |
| `/api/admin/group-buys` | POST | round fields | `{groupBuy}` | 400, 403 | **admin** | 20/15min |
| `/api/admin/group-buys/:id` | PATCH | partial | `{ok:true}` | 403, 404 | **admin** | 20/15min |
| `/api/admin/group-buys/:id` | DELETE | — | `{ok:true}` | 403, 404 | **admin** | 20/15min |
| `/api/admin/group-buys/:id/activate` | POST | — | `{ok:true}` | 403, 409 `already_active` | **admin** | 20/15min |
| `/api/admin/group-buys/:id/close` | POST | — | `{ok:true}` | 403, 404 | **admin** | 20/15min |
| `/api/admin/group-buys/:id/products` | PUT | `{productIds[]}` | `{ok:true}` | 403 | **admin** | 20/15min |
| `/api/admin/group-buys/:id/availability` | PUT | `{productId, isAvailable}` | `{ok:true}` | 403 | **admin** | 20/15min |
| `/api/admin/orders?group_buy_id=` | GET | — | `{orders}` | 403 | **admin** | 60/min |
| `/api/admin/orders/:id` | PATCH | `{order_status?, payment_status?}` | `{ok:true}` | 400 `no_fields`, 404 | **admin** | 20/15min |

**Key behaviors:**

- **`/api/access/verify`** — `bcrypt.compare(code, tenant.access_code_hash)`. On success mint `{tenantId, authed:true, codeVersion: tenant.code_version}`.
- **`/api/admin/login`** — bcrypt against `tenants.admin_password_hash` (**not** an env var; the original used `ADMIN_PASSWORD` and that cannot scale to tenants). **FIX: merge, don't replace** — `session = {...session, isAdmin:true, adminSessionVersion}`. The original replaced the session wholesale, silently dropping the visitor's `authed` flag. Write an `auth_audit` row on success and failure.
- **`/api/admin/access-code`** — authorized by the **admin session cookie only**; the browser never sends the old code. Require `newCode.length >= 6`, `bcrypt.hash(newCode, 12)`, bump `code_version`, audit it. Every visitor of that tenant drops on their next heartbeat.
- **`/api/admin/group-buys/:id/activate`** — one transaction: close the tenant's other active round, then activate this one. The partial unique index makes a concurrent double-activation fail loudly rather than corrupt state. Catch the unique violation → `409`.
- **`/api/admin/orders` PATCH** — strict allowlist: only `order_status` and `payment_status` are writable. Anything else is dropped. Empty patch → `400 no_fields`. Zero rows changed → `404`.
- **Errors:** generic `500 {error:'server_error'}` to the client, details to server logs only.

**Constant-time comparison helper** — when comparing any secret that is not bcrypt'd (e.g. an API token), **SHA-256 both sides to a fixed 32 bytes first**, then compare timing-safely. Comparing raw strings short-circuits on length mismatch and leaks the secret's length. This is the non-obvious part; don't drop it.

---

## 5. Server-side order validation — the trust boundary

Never trust a client-supplied price. On checkout, re-price and re-validate every line **on the server**, then write the order from the server's numbers.

```
reject payload with > 200 lines            ← DoS guard

for each line:
  resolve product (+ variation) for THIS TENANT   → not found ⇒ available=false, price 0
  compute base price for the pricing mode
  apply product discount, then any global discount — LEAST() wins, never stack additively
  available := product.available

  IF available AND product.group_buy_id IS NOT NULL:
      round := the product's group buy
      IF round.status <> 'active'          ⇒ available := false   ← FIX, see below
      IF round.id <> tenant's active round ⇒ available := false   ← FIX, see below
      look up group_buy_product_availability(round.id, product.id)
      IF a row exists AND is_available = false ⇒ available := false

  unavailable lines are EXCLUDED from the subtotal
```

**The two FIX lines are gaps in the original.** It checked per-round availability but never whether the round was still open, nor whether the product belonged to the *active* round — so a crafted request could buy from a closed round. Its UI enforced this; the server did not.

On success, stamp the order with **both** `group_buy_id` and `group_buy_number` (see rule 5 below).

---

## 6. The supplier report — read this twice

This is the single easiest thing to get wrong, and getting it wrong means ordering the wrong quantities from a real supplier.

```
DEMAND    = every order placed, EXCEPT cancelled/canceled/refunded.
            An unpaid, brand-new order COUNTS. That is what the supplier
            order is sized against.

COMMITTED = the subset that is payment_status='paid'
            OR order_status IN (confirmed, processing, shipped, delivered, completed)
```

**Headline numbers are DEMAND. Committed is reported *alongside*, never instead.** The instinct to "only count paid orders" is wrong here and will under-order.

Build a 3-sheet `.xlsx`:

- **Totals** — round metadata, then Placed Orders, Cancelled Orders, Total Customers, Total Items, Committed Orders, Committed Items, plus sales by currency for both placed and committed. Include a note row explaining the two sets of numbers so the operator isn't confused.
- **Product Summary** — one row per `product||variation`: Total Qty Needed (demand), Committed Qty, Orders count. Sorted by demand descending. **This is the sheet the supplier order gets built from.**
- **Orders** — one row per order *line*. List **every** order including cancelled ones, with a `Counted` column (Yes/No) showing which fed the demand numbers. Audit trail by design.

Filename: `GB-{gb_number}-{slug(title)}-report.xlsx`. Customer uniqueness for the count: `email || phone || name`, lowercased.

**Split the pure data prep from the file writing** — `prepareReport(round, orders) → {orderRows, summaryRows, totalsRows, filename}` with no xlsx import. **Write its tests first.** It is pure, and the demand-vs-committed rule is exactly where a rewrite silently breaks.

**Lazy-load SheetJS** inside the download handler only (`const XLSX = await import('xlsx')`). It is large and must never enter the storefront bundle.

---

## 7. Frontend

```
app/
├── middleware.ts                     # tenant resolve + HMAC verify (Web Crypto)
├── s/[slug]/
│   ├── layout.tsx                    # AccessProvider, tenant branding
│   ├── page.tsx                      # storefront
│   └── admin/…                       # dashboard
components/
├── access/
│   ├── AccessGate.tsx                # swaps the whole app when unauthed
│   └── AccessCodePage.tsx            # one password field + error text
├── group-buy/
│   ├── GroupBuyBanner.tsx            # active round + scope toggle
│   └── GroupBuyLockNotice.tsx        # locked-product notice + jump link
└── admin/group-buy/
    ├── GroupBuyList.tsx              # table, status pills, actions
    ├── GroupBuyForm.tsx              # create/edit
    ├── GroupBuyAssign.tsx            # search + bulk assign
    └── GroupBuyAvailability.tsx      # toggles + hide/disable
lib/
├── accessApi.ts                      # discriminated unions, never throws
└── groupBuyReport.ts                 # pure prep + lazy xlsx
```

Keep the original's five component files rather than one — its admin manager is a 614-line component holding four screens.

**Access state:** `status: 'loading' | 'authed' | 'unauthed'`. Start at `'loading'` so the gate never flashes before the first check resolves.

**Heartbeat:** ping `/api/session` on user activity (`click`, `keydown`, `mousemove`, `scroll`, `touchstart`), **throttled to once per 60s**, listeners `{passive:true}`. Also force a re-check on `visibilitychange` → visible, since the tab may have idled past expiry while backgrounded. When the server says the session is gone, flip to `unauthed` and the gate reappears mid-session with no reload.

**The SPA-fallback check — mandatory.** Never treat a `2xx` as success unless the body is literally `{authenticated:true}` / `{ok:true}`. A misrouted `/api` returns your HTML shell with a `200`; without this check a bad rewrite **grants admin to anyone**. This is a real failure mode the original team hit.

**Storefront GB behavior:**
- Banner when a round is active: *"🛒 Group Buy #{gb_number} — {title} is now OPEN"* + close date if set.
- "Explore GB #N" narrows the storefront to that round's products and smooth-scrolls to the product section. **Defaults to off** so browsing never breaks when nothing is assigned. Toggle is reversible both ways.
- Products **not** in the active round are `gbLocked`: show a notice and a jump-to-round link instead of Add to Cart.
- `gb_unavailable_behavior = 'hide'` → filter the product out. `'disable'` → render it non-purchasable. Either way the cart must refuse it and the server must reject it.

Client API calls: `credentials: 'include'`, return `{ok:true} | {ok:false, reason}` discriminated unions, never throw.

---

## 8. Non-negotiable business rules

1. **Tenant isolation on every read, write, and session check.** `session.tenantId === tenant.id`, always.
2. Access code and admin password are **bcrypt cost 12**, in a service-role-only table. Neither ever reaches client JS.
3. Sessions are **stateless signed cookies**. No session table.
4. **Exactly one active round per tenant** — enforced by the partial unique index, not application code.
5. Orders stamp **both** `group_buy_id` **and** a text snapshot of `group_buy_number`. Renaming a round must never rewrite history.
6. **No availability row = available.**
7. `gb_number` is **free text and may repeat.** Suggest `max(numeric labels) + 1` in the UI, ignoring non-numeric ones. Do not add a unique constraint — the original removed one on purpose.
8. **Report demand = every placed order, paid or not.** Only cancelled/canceled/refunded are excluded. Committed is reported alongside, never instead.
9. Cancelled orders still appear in the Orders sheet with `Counted = No`.
10. Rotating the access code bumps `code_version` and logs out that tenant's visitors — and only that tenant's.
11. Rotation is authorized by the **admin session**, never by a secret from the browser.
12. Admin order writes are allowlisted to `order_status` and `payment_status`.
13. **No AI anywhere in either subsystem.** Both are exact-comparison and exact-arithmetic paths. A model is strictly worse.
14. 15-minute **rolling idle** timeout with `exp` inside the signed payload.
15. Errors: generic to the client, detailed in server logs. Real CSP with per-request nonces (the original disabled CSP entirely — do not copy that).

---

## 9. Environment

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY      # server-only. NEVER expose to the browser.
SESSION_SECRET                 # 48+ random bytes:
                               # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Fail fast at boot if `SESSION_SECRET` is missing**, with that generate command in the error message.

**Gotcha worth knowing up front:** the original hit repeated login failures from direct `DATABASE_URL` Postgres connections, because Supabase resolves **IPv6-only**. Use the Supabase client over HTTPS with the service-role key and the problem disappears. If auth mysteriously fails locally, check that first — along with whether your local dev server actually proxies `/api`.

---

## 10. Build order

Do it in this order; each step is testable before the next.

1. `tenants` table + RLS-no-policies + a seed script that bcrypts an initial code and admin password
2. Cookie session module — **test signature tampering, expiry, and cross-tenant reuse FIRST.** It is pure and it is the trust boundary
3. Tenant resolution + `middleware.ts` HMAC verify (Web Crypto)
4. `/api/access/verify` + `/api/session` + `/api/logout` + rate limits
5. AccessGate + code page + heartbeat + visibility re-check
6. `/api/admin/login` (bcrypt from DB, merge-not-replace) + admin session
7. Code rotation + `code_version` bump + `auth_audit`
8. `group_buys` schema + partial unique index + tenant-scoped SELECT-only RLS
9. Admin GB routes (create/edit/delete/activate/close) — activate in one transaction
10. Product assignment (single + bulk)
11. Storefront banner + GB-only scope + `gbLocked`
12. Availability table + toggle route + hide/disable setting
13. **Server-side order validation with all three GB gates** (§5)
14. Order stamping at checkout
15. Report — **`prepareReport` test-first** (§6), then lazy xlsx
16. Real CSP with nonces

**Before you start, ask me:** which tenant resolution I want (path `/s/acme` vs subdomain), and whether my `products`/`orders` tables already have a `tenant_id` column — the Group Buy wiring in §1 assumes they do.
