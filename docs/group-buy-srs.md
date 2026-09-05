# Group Buy — Software Requirements Specification

Reverse-engineered from the DiamondGlow implementation. Scope: **the Group Buy flow only.** Products, cart, checkout, and admin auth appear only where the GB flow touches them.

Anything marked **[ASSUMPTION]** is inferred, not observed in code.

---

## 1. Product Concept

A **Group Buy (GB)** is a preorder *round*. The operator opens a round, assigns products to it, customers order during the window, the operator closes it, then exports a supplier report telling them exactly how many units of each product to buy.

Three invariants define the whole system:

1. **One round is active at a time.** Activating a round auto-closes any other active round.
2. **A round is a scope, not a store.** Products not assigned to the active round remain browsable and sellable — GB scoping is a *filter*, not a gate. (Exception: per-GB availability, below, is a real gate.)
3. **The report measures supplier demand, not revenue.** Every placed order counts toward quantities, including unpaid ones. Only cancelled/refunded are excluded. This is the single most important business rule and the easiest to get wrong.

---

## 2. User Journey

### 2.1 Admin (round operator)

| Stage | Detail |
|---|---|
| **Entry point** | Admin dashboard → Group Buy Manager |
| **Actions** | Create round → assign products → activate → (monitor) → toggle per-product availability → close → download report |
| **Decision points** | Which products belong to the round; whether an OFF product is *hidden* or *shown-but-disabled*; when to activate (closing the previous round); when to close |
| **Outputs** | An active round visible on the storefront; a multi-sheet `.xlsx` supplier report |
| **Next step** | Place the supplier order from the Product Summary sheet; open the next round |

### 2.2 Customer

| Stage | Detail |
|---|---|
| **Entry point** | Storefront banner: *"🛒 Group Buy #N — {title} is now OPEN"*, with a close date if set; or the "Explore GB #N" hero button |
| **Actions** | Click the banner/button → storefront narrows to the round's products → browse → add to cart → checkout |
| **Decision points** | View GB-only vs. all products (toggleable both ways); whether to buy a locked non-GB product (they cannot — the modal explains and offers a jump back to the round) |
| **Outputs** | An order stamped with `group_buy_id` + `group_buy_number` |
| **Next step** | Order fulfilled when the round closes and the supplier order lands |

The customer never sees the word "preorder" or a progress bar — there is **no MOQ, no threshold, no "X of Y joined" mechanic.** This is a *scheduled ordering window*, not a threshold-based group buy. Do not add threshold logic to a clone unless you intend a different product.

---

## 3. Complete Workflow

### 3.1 Round lifecycle

```
Admin creates round (status: upcoming)
  → Inputs: gb_number (free text), title, description?, start_date?, end_date?
  → Validation: title required; gb_number required (see §12)
  → Storage: INSERT group_buys
  → Feedback: flash "Group buy created"

Admin assigns products
  → UI: searchable product list, per-item toggle + bulk assign
  → Processing: UPDATE products SET group_buy_id = <round | NULL>
  → Note: assignment is exclusive — a product belongs to at most one round

Admin activates round (status: active)
  → Pre-step: every OTHER active round is set to 'closed' first (client-side loop)
  → Storage: UPDATE group_buys SET status='active'
  → Propagation: Supabase Realtime on group_buys → every open storefront tab
    re-fetches and shows the banner within ~1s, no reload

Customer orders
  → Checkout stamps group_buy_id + group_buy_number from the ACTIVE round
  → Pricing/availability validated server-side (§3.2)

Admin closes round (status: closed)
  → Banner disappears; products stay assigned for reporting

Admin downloads report
  → Fetch all orders → filter to this round → build 3-sheet xlsx client-side
```

### 3.2 Server-side validation (the security backstop)

Checkout calls the Postgres RPC `validate_and_price_order(p_items jsonb, p_pricing_mode text)` — `SECURITY DEFINER`. It re-prices every line from the database and re-checks availability, so a tampered client cannot buy an OFF product or set its own price.

GB-relevant logic inside it:

```
for each line:
  resolve product (+ variation)         → not found ⇒ available=false, price 0
  compute base price by pricing_mode    → national | international
  apply product discount, then global discount (LEAST wins)
  available := products.available
  IF available AND product.group_buy_id IS NOT NULL:
      look up group_buy_product_availability(group_buy_id, product_id)
      IF row exists AND is_available = false ⇒ available := false
  unavailable lines are excluded from subtotal
```

Also carries a DoS guard: payloads over 200 lines raise an exception.

**Note the gap:** the RPC enforces *per-GB availability*, but does **not** enforce that a product belongs to the *active* round, nor that the round is still open. GB-only scoping and `gbLocked` are client-side presentation. A crafted request can order a closed round's product. See §12.

### 3.3 Report generation

```
Trigger:    admin clicks "Report" on a round
Fetch:      listOrders() → all orders with items
Filter:     orders where group_buy_id = this round
Partition:  placed    = NOT in {cancelled, canceled, refunded}
            committed = placed AND (payment_status='paid'
                        OR order_status IN {confirmed, processing, shipped, delivered, completed})
Build:      3 sheets (below)
Output:     xlsx download, filename GB-{gb_number}-{slug(title)}-report.xlsx
```

SheetJS is **lazy-loaded** inside the download handler so it never enters the storefront bundle. Preserve this in a clone — it is a large dependency.

**Sheets:**

- **Totals** — round metadata, then Placed Orders, Cancelled Orders, Total Customers, Total Items, Committed Orders, Committed Items, and sales broken out by currency (both placed and committed). Includes an explanatory Note row so the operator isn't confused by two sets of numbers.
- **Product Summary** — one row per `product||variation`: Total Qty Needed (demand), Committed Qty, Orders count. Sorted by demand descending. **This is the sheet the supplier order is built from.**
- **Orders** — one row per order *line*. Every order is listed including cancelled ones, with a `Counted` column (Yes/No) marking whether it fed the demand numbers. Audit trail by design.

Customer uniqueness is `email || phone || name`, lowercased. **[ASSUMPTION]** this is a pragmatic dedupe, not an identity system — there are no customer accounts.

---

## 4. Feature Breakdown

### 4.1 Round CRUD

- **Purpose:** define a preorder window.
- **User value:** operator controls what's on sale and when, without touching product records.
- **Backend:** `group_buys` table; plain inserts/updates via Supabase client.
- **Data:** `gb_number` (text), `title`, `description`, `start_date`, `end_date`, `status`.
- **Edge cases:** `gb_number` is **free text** (migrated from integer) so "Mini GB" / "Holiday Round" work; uniqueness was deliberately **dropped** — labels may repeat. The UI still auto-suggests the next sequential number by parsing numeric labels and taking `max+1`, ignoring non-numeric ones. Dates are stored as ISO/UTC, edited via `datetime-local` inputs with explicit local↔ISO conversion helpers.

### 4.2 One-active-round enforcement

- **Purpose:** guarantee exactly one banner / one checkout stamp.
- **Backend:** **client-side loop** in `setStatus` — closes other active rounds, then activates the target.
- **Edge cases:** ⚠️ **Not atomic and not enforced in the database.** Two admins activating simultaneously, or a failure mid-loop, can leave two active rounds. The storefront then silently picks the first by `created_at DESC`. A clone should enforce this with a partial unique index (§15).

### 4.3 GB-only storefront scoping

- **Purpose:** focus the customer on the current round.
- **Backend:** none — pure client filter `item.group_buy_id === activeGroupBuy.id`.
- **Edge cases:** defaults to **off**, deliberately, so browsing never breaks when nothing is assigned. Toggle is reversible ("View all products" ↔ "View GB #N only").

### 4.4 Locked (non-GB) products

- **Purpose:** while a round is open, steer customers into it.
- **Logic:** `gbLocked = activeGroupBuy && product.group_buy_id !== activeGroupBuy.id`. Locked products show a notice and a "go to the group buy" jump instead of Add to Cart.
- **Edge cases:** client-side only — the RPC does not enforce it.

### 4.5 Per-GB product availability

- **Purpose:** turn a product OFF *inside one round* without changing its global `available` flag — the same product can be on in one round and off in another.
- **Backend:** `group_buy_product_availability(group_buy_id, product_id, is_available)`, unique on the pair. **No row = available.** Sparse by design.
- **Enforcement:** real — the RPC blocks it at checkout.
- **Edge cases:** the RPC `COALESCE(is_available, true)`s defensively even though the column is `NOT NULL`. Table is added to the `supabase_realtime` publication inside an exception-swallowing `DO $$` block, so a missing publication doesn't fail the migration.

### 4.6 Unavailable behavior: hide vs disable

- **Purpose:** operator choice — vanish an OFF product, or show it greyed out.
- **Backend:** single `site_settings` row `gb_unavailable_behavior` ∈ `{hide, disable}`, default `hide`.
- **Data flow:** `hide` filters the product out of `filteredProducts`; `disable` keeps it rendered and passes it in `unavailableProductIds` so the card renders non-purchasable. Either way `useCart` receives `unavailableIds` and refuses the item.

### 4.7 Order stamping

- **Purpose:** durably attach an order to its round.
- **Logic:** at checkout, if a round is active, spread `{ group_buy_id, group_buy_number }` onto the order.
- **Edge cases:** `group_buy_number` is a **denormalized snapshot** — if the admin later renames the round, historical orders keep the label they were sold under. Intentional. `ON DELETE SET NULL` on the FK means deleting a round orphans its orders but preserves the text label.

### 4.8 Report export — see §3.3

### 4.9 Migration-tolerance

Both hooks detect "table doesn't exist" (`42P01`, `PGRST205`, or message matching *does not exist* / *could not find the table* / *schema cache*) and degrade to `available: false` with empty data instead of erroring. The storefront works fully before the GB migration is applied. **Worth keeping in a clone** if you ship migrations independently of code.

---

## 5. Database Design

```sql
group_buys (
  id           uuid PK default gen_random_uuid(),
  gb_number    text NOT NULL,          -- free-text label; NOT unique
  title        text NOT NULL,
  description  text,
  start_date   timestamptz,
  end_date     timestamptz,
  status       text NOT NULL DEFAULT 'upcoming'
               CHECK (status IN ('upcoming','active','closed')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
)
INDEX on gb_number, status

group_buy_product_availability (
  id            uuid PK,
  group_buy_id  uuid NOT NULL REFERENCES group_buys(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  is_available  boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (group_buy_id, product_id)
)
INDEX on group_buy_id, product_id

products.group_buy_id      uuid REFERENCES group_buys(id) ON DELETE SET NULL   -- INDEXED
orders.group_buy_id        uuid REFERENCES group_buys(id) ON DELETE SET NULL   -- INDEXED
orders.group_buy_number    text                                                -- snapshot

site_settings['gb_unavailable_behavior'] = 'hide' | 'disable'
```

**Relationships:** `group_buys 1—N products` (a product is in at most one round) · `group_buys 1—N orders` · `group_buys N—N products` through `group_buy_product_availability` (sparse override table only).

**Status values:** round `upcoming | active | closed`. Order statuses consumed by the report: `cancelled|canceled|refunded` (excluded), `confirmed|processing|shipped|delivered|completed` (committed), plus `payment_status = 'paid'`.

**Generated data:** the xlsx report (not persisted — regenerated on demand), `nextGbNumber` suggestion, `availabilityMap` / `unavailableIds`.

**Security posture:** RLS is enabled but policies are `USING (true) WITH CHECK (true)` for **both read and write, to `anon`.** The entire admin runs on the anon key behind a client-side password gate. **This is not a security boundary — anyone with the public anon key can create, activate, and delete rounds.** Do not port this to a real SaaS; see §10 and §15.

---

## 6. Automation Flow

```
ACTIVATE ROUND
Trigger    admin clicks "Activate"
Validation none client-side beyond the button being shown
Processing close all other active rounds (loop) → set this one active
Storage    UPDATE group_buys ×N
Broadcast  Supabase Realtime postgres_changes on group_buys
Feedback   flash toast (admin) + banner appears on every open storefront tab
```

```
TOGGLE PER-GB AVAILABILITY
Trigger    admin flips a product switch inside a round
Validation groupBuyId must be present
Processing UPSERT on conflict (group_buy_id, product_id)
Storage    group_buy_product_availability
Broadcast  Realtime on that table
Feedback   storefront hides/disables the product live; cart refuses it;
           RPC rejects it at checkout even if the UI is bypassed
```

```
PLACE GB ORDER
Trigger    customer submits checkout
Validation validate_and_price_order() re-prices + re-checks availability server-side
Processing stamp group_buy_id + group_buy_number from the active round
Storage    orders
Feedback   confirmation
```

```
CLOSE + REPORT
Trigger    admin closes round, clicks Report
Processing fetch orders → filter to round → partition placed/committed → build sheets
AI         none
Storage    none (ephemeral download)
Feedback   xlsx file downloads
```

**Sync mechanism:** every GB hook pairs a Realtime channel with a `window` `focus` listener that re-fetches. Realtime is the fast path; focus-refetch is the safety net for dropped subscriptions and backgrounded tabs. Channel names are salted with `Date.now()` to avoid collisions across remounts.

---

## 7. AI Prompts

**None. The Group Buy flow contains zero AI.** All logic is deterministic SQL and TypeScript. Do not introduce an LLM into pricing, availability, or report math — these are exact-arithmetic paths where a model is strictly worse.

---

## 8. API Requirements

There is no REST layer for Group Buy — the client talks to Supabase (PostgREST + Realtime) directly with the anon key. Equivalent surface if you rebuild it properly:

| Purpose | Method | Inputs | Outputs | Auth |
|---|---|---|---|---|
| List rounds | `GET /group-buys` | — | `GroupBuy[]` ordered `created_at DESC` | public read |
| Create round | `POST /group-buys` | `gb_number, title, description?, start_date?, end_date?, status?` | `GroupBuy` | **admin** |
| Update round | `PATCH /group-buys/:id` | partial + `updated_at` | ok | **admin** |
| Set status | `PATCH /group-buys/:id/status` | `status` | ok — must atomically close others when activating | **admin** |
| Delete round | `DELETE /group-buys/:id` | — | ok | **admin** |
| Assign product | `PATCH /products/:id` | `group_buy_id \| null` | ok | **admin** |
| Read availability | `GET /gb-availability?group_buy_id=` | round id | `{product_id, is_available}[]` | public read |
| Set availability | `PUT /gb-availability` | `group_buy_id, product_id, is_available` (upsert) | ok | **admin** |
| Read/set behavior | `GET/PUT /settings/gb_unavailable_behavior` | `hide \| disable` | ok | read public / write **admin** |
| Validate + price | `POST /rpc/validate_and_price_order` | `p_items[], p_pricing_mode` | `{items[], subtotal, pricing_mode}` | anon (by design — it is the trust boundary) |
| Report data | `GET /orders?group_buy_id=` | round id | orders + items | **admin** |
| Realtime | WS | `group_buys`, `group_buy_product_availability` | change events | public |

Today every "**admin**" row is in reality anon-writable.

---

## 9. Frontend Components

**Admin — `GroupBuyManager.tsx`** (single ~614-line component, four views via a `view` state machine: `list | form | assign | availability`):

- Rounds **table** — status pill (`STATUS_STYLES` per status), product count, committed/cancelled order counts, action buttons: Activate / Close / Assign / Availability / Report / Edit / Delete
- Round **form modal** — gb_number (placeholder *"e.g. 5 or Mini GB"*), title (*"e.g. June Peptide Round"*), description (*"Optional notes shown to customers"*), start/end `datetime-local`, Save / Cancel
- **Assign view** — search box, product list with per-item toggle, multi-select + bulk assign/unassign
- **Availability view** — per-product on/off switches + hide-vs-disable selector
- Flash **message banner** (success/error, auto-clearing), Refresh button, Back button
- Report **download button** (lazy-loads SheetJS)

**Storefront:**

- **GB banner** (`App.tsx`) — "🛒 Group Buy #N — {title} is now OPEN", close date, and a scope toggle
- **Hero "Explore GB #N" button** — sets GB-only and smooth-scrolls to `#product-section`
- **`Menu.tsx`** — receives `unavailableProductIds`, `activeGroupBuy`, `onGoToGroupBuy`
- **`MenuItemCard.tsx` / `ProductDetailModal.tsx`** — accept `gbLocked`, `gbNumber`, `onGoToGroupBuy`; render a locked notice + jump link instead of Add to Cart
- **`Checkout.tsx`** — takes `activeGroupBuy`, stamps the order

No progress bars, no upload widgets, no dashboards in this flow.

---

## 10. Backend Services & Permissions

**Services:** exactly one piece of real backend logic — the `validate_and_price_order` Postgres function (`SECURITY DEFINER`, `SET search_path = public`, granted to `anon, authenticated`). Everything else is client code against PostgREST.

**Jobs / queues / webhooks / scheduled tasks: none.** Notably absent:

- No cron closes a round when `end_date` passes — **`end_date` is display-only.** A round stays active until an admin manually closes it.
- No notification when a round opens or closes.
- No automatic report generation on close.

**Roles (as built):** *Customer* (anonymous, no account) and *Admin* (client-side password gate). There is **no role in the database.** Both roles hit Postgres as `anon` with identical, unrestricted privileges.

**Access rules (as built):** read everything, write everything, anonymously. The only real server-side rule in the entire flow is the per-GB availability gate in the RPC.

**[ASSUMPTION]** this was an intentional trade for shipping speed on a small operator-run store. It does not survive contact with a multi-tenant SaaS.

---

## 11. State Machines

**Group buy round:**

```
                 ┌──────────────┐
   create ──────►│   upcoming   │
                 └──────┬───────┘
                        │ admin activates
                        ▼
                 ┌──────────────┐   activating another round
                 │    active    │──────────────┐
                 └──────┬───────┘              │
                        │ admin closes         │
                        ▼                      ▼
                 ┌──────────────────────────────┐
                 │           closed             │
                 └──────────────────────────────┘
```

Legal transitions: `upcoming→active`, `upcoming→closed`, `active→closed`, and `closed→active` (re-opening is permitted — nothing blocks it, and it force-closes the current round). Delete is available from any state. **`end_date` does not cause a transition.**

**Product within a round:** `unassigned → assigned(round) → [available | unavailable-in-round] → unassigned`. Availability is a sparse override; absence means available.

**Order (as the report reads it):**

```
placed ──► counted as DEMAND (Product Summary, Totals headline)
   │
   ├─ paid OR confirmed/processing/shipped/delivered/completed ──► also COMMITTED
   └─ cancelled/canceled/refunded ──► excluded from all counts,
                                      still listed in Orders sheet, Counted = "No"
```

---

## 12. Error Handling

**Validation errors:** GB form validates `title` and `gb_number` client-side only. Database enforces `NOT NULL` on both and the `status` CHECK. `gb_number` has **no format validation** — any text passes.

**API failures:** every hook mutation returns `{success: false, error: message}` rather than throwing; the manager surfaces it as a red flash toast. Fetches catch, check `isMissingTable`, and either degrade gracefully or set an error string.

**Retry logic: none anywhere.** No backoff, no retry queue. Failures are reported and the user retries manually. The focus-refetch listener is the closest thing to a recovery mechanism.

**Partial-failure handling:** `bulkAssign` uses `Promise.all` and counts failures, reporting *"N failed"* — so a partial bulk assign is visible but not rolled back.

**Known defects to fix in a clone:**

| # | Issue | Impact |
|---|---|---|
| 1 | Single-active-round enforced client-side, non-atomically | Two concurrent activations ⇒ two active rounds; storefront picks one arbitrarily |
| 2 | Anon has full write on `group_buys` and availability | Anyone with the public key can open/close/delete rounds |
| 3 | RPC doesn't check round status or active-round membership | A closed round's products remain purchasable via a crafted request |
| 4 | `end_date` is cosmetic | Rounds silently overrun; operator must remember to close |
| 5 | `setStatus` loop is O(N) sequential awaits | Fine at this scale, wrong shape for a real backend |

---

## 13. Technical Architecture

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind (`theme-accent` tokens), lucide-react icons |
| State | Custom hooks (`useGroupBuys`, `useGroupBuyAvailability`, `useCart`) — no Redux/Zustand/Query |
| Backend | Supabase (PostgREST) — no application server for GB. An Express-on-Vercel app exists (`api/_lib/app.js`) for admin orders, but GB writes bypass it |
| Database | Postgres (Supabase), RLS enabled but fully permissive |
| Realtime | Supabase Realtime `postgres_changes` |
| Business logic | One `SECURITY DEFINER` Postgres function |
| Reports | SheetJS (`xlsx`), lazy-loaded, client-side generation |
| Storage | None used by GB |
| AI providers | None |
| Auth | Client-side password gate on the admin; anonymous customers |
| Hosting | Vercel (`vercel.json`) |
| Third-party | WhatsApp (order contact — outside GB scope) |

---

## 14. Build Plan

**Phase 1 — MVP (the round works end to end)**
`group_buys` table + status CHECK · atomic single-active enforcement · round CRUD · product assignment (single + bulk) · storefront banner + GB-only scope toggle · order stamping (id + number snapshot) · server-side validate-and-price with GB membership + round-status checks.

**Phase 2 — Operator control**
Per-GB availability table + upsert · hide-vs-disable setting · RPC availability gate · locked-product notice with jump-to-round · Realtime + focus-refetch sync · admin order counts per round.

**Phase 3 — Reporting & automation**
3-sheet xlsx report with the demand/committed split · lazy-loaded SheetJS · **scheduled auto-close at `end_date`** (missing today) · **notifications on open/close** (missing today) · report snapshot persistence so a historical round reports identically after data changes **[ASSUMPTION — recommended, not in the original]**.

---

## 15. Cursor AI Build Instructions

Build a Group Buy module. Follow this exactly; where it differs from the reference implementation, the differences are deliberate fixes.

### Database schema

Create the schema in §5 verbatim, **with these three corrections**:

```sql
-- FIX 1: enforce single-active-round in the DATABASE, not the client.
CREATE UNIQUE INDEX group_buys_one_active_idx
  ON group_buys ((status)) WHERE status = 'active';

-- FIX 2: real RLS. Replace the permissive policies.
CREATE POLICY "group_buys public read"  ON group_buys FOR SELECT USING (true);
CREATE POLICY "group_buys admin write"  ON group_buys FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');
-- same shape for group_buy_product_availability

-- FIX 3: updated_at trigger instead of client-supplied timestamps.
CREATE TRIGGER group_buys_touch BEFORE UPDATE ON group_buys
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

Keep: `gb_number` as **text** and **non-unique**; `ON DELETE SET NULL` on `orders.group_buy_id`; the `group_buy_number` text snapshot; `UNIQUE(group_buy_id, product_id)` on the availability table with **no row meaning available**.

### Backend functions

1. **`activate_group_buy(p_id uuid)`** — `SECURITY DEFINER`, single transaction:
   `UPDATE group_buys SET status='closed' WHERE status='active' AND id <> p_id;`
   then `UPDATE group_buys SET status='active' WHERE id = p_id;`
   The partial unique index makes a concurrent double-activation fail loudly instead of corrupting state. Admin-only.

2. **`validate_and_price_order(p_items jsonb, p_pricing_mode text)`** — port the reference function (§3.2) and **add** the two missing gates:
   - reject a line whose product is assigned to a round with `status <> 'active'`
   - **[ASSUMPTION]** reject a line whose product belongs to a *different* round than the active one, mirroring the client's `gbLocked`
   Keep the 200-line DoS guard, the `LEAST()` discount stacking, `available=false` lines excluded from subtotal, and the `COALESCE(is_available, true)` default.

3. **`close_expired_group_buys()`** — new. `UPDATE group_buys SET status='closed' WHERE status='active' AND end_date < now();` Run on a schedule (Vercel cron, `0 * * * *`).

### API endpoints

Implement §8. Every admin row gets real auth middleware. Status changes go through `activate_group_buy`, never a raw update.

### Frontend components

```
src/
├── components/
│   ├── group-buy/
│   │   ├── GroupBuyBanner.tsx        # active round banner + scope toggle
│   │   ├── GroupBuyLockNotice.tsx    # locked-product notice + jump link
│   │   └── group-buy.css
│   └── admin/group-buy/
│       ├── GroupBuyManager.tsx       # shell + view router (list|form|assign|availability)
│       ├── GroupBuyList.tsx          # table, status pills, actions
│       ├── GroupBuyForm.tsx          # create/edit modal
│       ├── GroupBuyAssign.tsx        # search + bulk assign
│       └── GroupBuyAvailability.tsx  # toggles + hide/disable selector
├── hooks/
│   ├── useGroupBuys.ts
│   └── useGroupBuyAvailability.ts
└── utils/
    └── groupBuyReport.ts
```

**Split the 614-line manager into the five files above** — the reference version is over the 800-line ceiling's spirit and mixes four screens in one component.

Each hook: Realtime subscription + `focus` re-fetch, channel name salted with `Date.now()`, `isMissingTable` degradation, mutations returning `{success, error}` not throws.

### Business rules (non-negotiable)

1. Exactly one active round — enforced by database index.
2. `gb_number` is free text, may repeat; suggest `max(numeric labels) + 1`, ignore non-numeric.
3. Product belongs to at most one round; unassigned products sell normally.
4. No availability row = available.
5. Order stamps **both** the round id and a **text snapshot** of the label; renaming a round never rewrites history.
6. **Report demand = every placed order, paid or not. Only cancelled/canceled/refunded are excluded.** Committed (paid, or confirmed/processing/shipped/delivered/completed) is reported *alongside* demand, never instead of it.
7. Cancelled orders still appear in the Orders sheet with `Counted = No`.
8. Lazy-load SheetJS inside the download handler only.
9. No AI in this flow.

### Validation

Client: `title` non-empty, `gb_number` non-empty, `end_date > start_date` when both set (**[ASSUMPTION]** — not validated in the reference and should be). Server: `NOT NULL` + status CHECK + admin RLS. The RPC is the trust boundary for pricing and availability — never trust a client-supplied price.

### Development order

1. Schema + partial unique index + RLS + trigger
2. `activate_group_buy` + round CRUD API
3. `useGroupBuys` + admin list/form
4. Product assignment (single + bulk)
5. Storefront banner + GB-only scope + `gbLocked`
6. Availability table + `useGroupBuyAvailability` + hide/disable
7. `validate_and_price_order` with all three gates
8. Order stamping at checkout
9. Report util — **write `prepareGroupBuyReport` test-first**; it is pure, and rule 6 is where a clone will silently get the supplier order wrong
10. `close_expired_group_buys` cron
11. Realtime + focus sync

Tests exist at `tests/group-buy-report.test.mjs` and `docs/testing/group-buy-report-counts.tdd.md` — port them; they encode rule 6.
