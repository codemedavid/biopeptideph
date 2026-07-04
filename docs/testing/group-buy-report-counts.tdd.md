# TDD Evidence — Group Buy report shows false (understated) counts

**Date:** 2026-07-04
**Area:** `src/utils/groupBuyReport.ts` (admin Group Buy supplier/inventory report)

## Source plan
Derived during this TDD run from an inline `/ecc:plan` diagnosis (no `*.plan.md` file). Confirmed
symptom with the user: **Totals sheet showed far fewer items/orders/customers than the Orders sheet.**

## Root cause
`prepareGroupBuyReport` fed the Product Summary and Totals from `orders.filter(countsForSupplier)`,
which only accepts `paid` or `confirmed+` orders. Every order starts life as
`order_status:'new'` / `payment_status:'pending'` (`Checkout.tsx:279-280`), so a freshly-closed
round had almost all orders excluded from the totals while the Orders sheet still listed them —
reading as "false data".

## Fix
Headline counts now represent **supplier demand** = every *placed* (non-cancelled) order, with a
separate **committed** (paid/confirmed) breakdown reported alongside. Cancelled/refunded orders are
still excluded from all counts but remain listed on the Orders sheet.

- New helper `countsAsPlaced(o)` — not cancelled/refunded.
- `countsForSupplier(o)` unchanged in behavior (paid/confirmed gate), now layered on `countsAsPlaced`.
- Product Summary: `Total Qty Needed` (demand) + new `Committed Qty` column.
- Totals: `Placed Orders`, `Cancelled Orders`, `Total Customers`, `Total Items` (all demand-based)
  plus `Committed Orders`, `Committed Items`, and `Committed Sales (by currency)`.

## User journeys
- As an admin closing a group buy, I want the report's item/order/customer counts to match the
  orders I can see, so I can size the supplier order to real demand.
- As an admin, I want to also see how much of that demand is already paid/confirmed, so finance
  numbers stay visible.
- As an admin, I want cancelled orders left out of the counts but still auditable in the Orders sheet.

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | New/pending orders are counted in Total Items / Total Customers / Placed Orders | `tests/group-buy-report.test.mjs` "new/pending orders are counted…" | unit | PASS |
| 2 | Committed (paid/confirmed) breakdown reported alongside demand | `tests/group-buy-report.test.mjs` "a committed…breakdown…" | unit | PASS |
| 3 | Cancelled orders excluded from totals but still on Orders sheet | `tests/group-buy-report.test.mjs` "cancelled orders are excluded…" | unit | PASS |
| 4 | Product Summary qty = demand, with a committed sub-column | `tests/group-buy-report.test.mjs` "Product Summary qty…" | unit | PASS |
| 5 | `countsForSupplier` still gates paid/confirmed only (no regression) | `tests/group-buy-report.test.mjs` "countsForSupplier still gates…" | unit | PASS |

## Validation commands (actually run)
- **RED:** `npm test` → `# pass 19 # fail 4` (the 4 new-behavior tests failed: missing
  `Placed Orders` / `Committed Orders` / `Committed Items` / `Cancelled Orders` rows and
  `Committed Qty` column). Failure was the intended business-logic gap.
- **GREEN:** `npm test` → `# tests 23 # pass 23 # fail 0`.
- **Type-check:** `npx tsc --noEmit` → clean (no output).
- **Build:** `npm run build` → `✓ built in 3.71s`; `xlsx` remains a lazy-loaded chunk.

## Coverage / known gaps
- No coverage tool is configured in this repo (`node --test`); coverage asserted by behavioral
  cases above rather than a numeric threshold.
- ESLint could not run: pre-existing `@typescript-eslint/no-unused-expressions` rule-load crash
  that reproduces on untouched files (e.g. `src/hooks/useGroupBuys.ts`) — unrelated to this change.
- The test runner now requires Node's native TS type-stripping: `package.json` `test` script gained
  `--experimental-strip-types` (Node ≥ 22.6). No-op for the existing `.mjs`/`.js` tests.
