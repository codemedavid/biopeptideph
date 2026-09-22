# TDD evidence — USD ↔ PHP conversion

**Task:** "fix the usd to php convertions feature" (2026-09-22)
**Scope, as confirmed by the user:** the bulk **USD → PHP** admin tool rewriting
admin-entered peso prices.
**Source plan:** none. The journey below was derived during this TDD run after
reading the conversion code; no `*.plan.md` was supplied.

## The defect

`AdminDashboard.handleApplyExchangeRateUsdToPhp` read `international_price`,
multiplied it by the rate, and overwrote `national_price` + `base_price` on
every row unconditionally. A USD price is stored as `DECIMAL(10,2)`, so that
round-trip does not return the peso price it was derived from:

```
₱1,499 / 64 = 23.421875  →  stored as $23.42  →  23.42 × 64 = ₱1,498.88
```

Every apply therefore shaved centavos off prices the admin had typed by hand,
and the drift compounded across applies. The same loop also wrote `₱0` for rows
whose USD price or rate was unusable, which would have put a product on sale
for free.

## User journey

> As the shop admin, I want to apply an exchange rate in the **USD → PHP**
> direction, so that peso prices follow the USD prices I set — **without** the
> tool nudging peso prices that were already correct.

Acceptance criteria:

1. A peso price already consistent with its USD price at the applied rate is not written at all.
2. Re-applying the same rate any number of times is idempotent.
3. A USD price the admin genuinely changed still re-derives the peso price.
4. A changed rate still re-derives every peso price.
5. A row with no usable USD price or no usable rate is skipped, never written as ₱0.

## Task report

### 1. Extract the per-row decision into a testable pure function

`phpPriceUpdateFromUsd(usd, currentPhp, rate)` in `src/lib/exchange.ts` returns
the peso price to write, or `null` when the row must be left alone. The rule:
a peso price that round-trips back to the stored USD price at this rate is
consistent, so it is skipped.

**RED (compile-time), `node --experimental-strip-types --test tests/exchange.test.mjs`:**

```
# SyntaxError: The requested module '../src/lib/exchange.ts' does not provide
#   an export named 'phpPriceUpdateFromUsd'
# tests 1 / pass 0 / fail 1
```

**RED (runtime)** — the tool's existing behaviour was then extracted verbatim
into that function, to prove the suite actually detects the drift rather than
just the missing export:

```
not ok 1 - a peso price that already matches its USD price is left untouched…
  expected: ~          actual: 1498.88
not ok 2 - repeated USD->PHP applies never drift a consistent peso price
  expected: 1000       actual: 1000.32
not ok 7 - a product with no usable USD price is skipped, never written as free
  expected: ~          actual: 0
not ok 8 - an unusable rate is skipped rather than zeroing the peso price
  expected: ~          actual: 0
# tests 13 / pass 9 / fail 4
```

**GREEN:** `# tests 13 / pass 13 / fail 0`

Guaranteed: criteria 1–5 above.

### 2. Route the admin tool through that function

`handleApplyExchangeRateUsdToPhp` now fetches the current peso price alongside
the USD price (`national_price ?? base_price` for products,
`national_price ?? price` for variations), skips rows the function returns
`null` for, counts them, and reports them in the confirm dialog and result
alert instead of claiming it updated everything.

**GREEN, `npm test`:** `# tests 95 / pass 95 / fail 0` (82 before this change, 13 new).
**Build, `npm run build`:** `✓ built in 3.09s`.

### 3. Make the module loadable by the test runner

`src/lib/exchange.ts` imported `'./pricing'` without an extension, which Node's
type-stripping ESM loader cannot resolve (`ERR_MODULE_NOT_FOUND`) — that is why
no test had ever covered this module. Changed to `'./pricing.ts'`;
`allowImportingTsExtensions` is already set in `tsconfig.app.json` and Vite
resolves it unchanged, confirmed by the production build above.

This was a test-setup fix applied *before* the RED gate, and it is the reason
the first RED attempt was rejected as an invalid (setup-caused) failure.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A peso price already matching its USD price at the rate is not rewritten (no ₱1,499 → ₱1,498.88 drift) | `tests/exchange.test.mjs:a peso price that already matches…` | unit | PASS |
| 2 | Repeated applies are idempotent across ₱1,000 / ₱1,499 / ₱2,500 / ₱349 / ₱12,999 | `tests/exchange.test.mjs:repeated USD->PHP applies never drift…` | unit | PASS |
| 3 | A USD price edited to $25.00 rewrites the peso price to ₱1,600 | `tests/exchange.test.mjs:a USD price the admin actually changed…` | unit | PASS |
| 4 | A product with no peso price yet gets one from its USD price | `tests/exchange.test.mjs:a product with no peso price yet…` | unit | PASS |
| 5 | A disagreement larger than rounding ($15.60 vs $15.63) is corrected | `tests/exchange.test.mjs:a peso price that disagrees by more than rounding…` | unit | PASS |
| 6 | Changing the rate 64 → 58 re-derives the peso price | `tests/exchange.test.mjs:a changed rate re-derives every peso price` | unit | PASS |
| 7 | `null` / `0` / negative / `NaN` / non-numeric USD is skipped, never written as ₱0 | `tests/exchange.test.mjs:a product with no usable USD price…` | unit | PASS |
| 8 | An unusable rate (`0`, negative, `NaN`, `null`) is skipped, never zeroing the peso price | `tests/exchange.test.mjs:an unusable rate is skipped…` | unit | PASS |
| 9 | `phpToUsd` / `usdToPhp` divide and multiply, rounded to centavos | `tests/exchange.test.mjs:phpToUsd divides…` / `usdToPhp multiplies…` | unit | PASS |
| 10 | Conversions return `0` for unusable prices or rates | `tests/exchange.test.mjs:conversions return 0…` | unit | PASS |
| 11 | `normalizeRate` accepts saved string rates and rejects unusable ones | `tests/exchange.test.mjs:normalizeRate accepts saved string rates…` | unit | PASS |

Evidence command for all of the above: `npm test`.

## Coverage

`node --experimental-strip-types --experimental-test-coverage --test tests/exchange.test.mjs`

```
# file          | line % | branch % | funcs %
#   exchange.ts | 100.00 |   100.00 |  100.00
#   pricing.ts  |  48.99 |   100.00 |    9.09
```

`src/lib/exchange.ts` is at 100/100/100, above the 80% floor.

## Known gaps

- **`src/lib/pricing.ts` is at 49% lines / 9% functions.** Only `round2` is
  reached through this suite. `computeEffectivePrice` and the discount
  precedence logic remain untested and are outside this task's scope.
- **No integration test for the handler itself.** `handleApplyExchangeRateUsdToPhp`
  is an inline React handler talking to Supabase; the decision it makes per row
  is fully covered as a pure function, but the fetch/update loop around it is
  not exercised by an automated test. Verify by hand: apply a rate twice in the
  admin panel and confirm the second apply reports every row as "already
  correct" and changes no peso price.
- ~~Two further defects were found and deliberately left unfixed.~~ **Both were
  fixed in a follow-up pass — see "Round 2" below.**

## Merge evidence

Checkpoint commits on `main`, in order:

| Commit | Stage | Evidence captured |
|--------|-------|-------------------|
| `76787e0` | RED | `test: add reproducer for USD->PHP peso price drift` — missing-export RED quoted in the commit body |
| `62dd6aa` | GREEN | `fix: stop the USD->PHP rate apply from drifting peso prices` — `npm test` 95/95 and `npm run build` quoted in the commit body |

No refactor commit: the implementation needed no cleanup after GREEN.

Both commits stage **only** the hunks belonging to this task. Unrelated
in-progress work in the same two files (the MOQ/kit panel additions in
`AdminDashboard.tsx`, and a pending `DEFAULT_USD_PHP_RATE` 56 → 64 edit in
`exchange.ts`) was deliberately left uncommitted in the working tree.

---

# Round 2 — the two remaining conversion defects

**Task:** "fix the other two conversion bugs too" (2026-09-22)

## Defect A — NaN / Infinity checkout totals

`site_settings` rows are text, parsed in `useSiteSettings` with a bare
`parseFloat`, so a malformed row (`'₱64'`, `'sixty four'`, `'  '`) became `NaN`.
Every consumer guarded with `?? DEFAULT`, which does not help: `??` catches only
`null` and `undefined`, and **`NaN ?? 64` is `NaN`**. The NaN then reached
`Checkout`, which divided by the raw value, so the USD shipping fee and the
grand total rendered as `$NaN` (a saved rate of `'0'` gave `$Infinity`).

**Fix, at the boundary:** new `src/lib/settings.ts` exports
`parseNumericSetting(raw, fallback)` — a value survives only if it is finite and
non-negative. Applied to `usd_php_rate`, `admin_fee_php`, `admin_fee_usd` and
`global_discount_value`. Stricter than `parseFloat` on purpose: `'64abc'` is a
corrupt row, not a rate of 64.

**Fix, at the call site:** `Checkout.getLocationFee` no longer hand-rolls the
division; it calls `feeInCurrency()`, which resolves the rate through
`resolveRate()` and returns `0` rather than `NaN` for an unreadable fee. The
`150` / `3` admin-fee literals became `DEFAULT_ADMIN_FEE_PHP` / `_USD`.

## Defect B — products offered free abroad

The **PHP → USD** bulk apply wrote `international_price = 0` for rows with no
usable peso price. A stored `0` is not `null`, so `international_price ??
base_price` priced those products at **$0.00** for international shoppers.
`usdPriceUpdateFromPhp()` now returns `null` for such rows and the handler skips
them — mirroring the USD → PHP direction — and reports the skipped count.

## RED / GREEN

**RED**, `npm test`:

```
# SyntaxError: ... does not provide an export named 'feeInCurrency'
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/lib/settings.ts'
# not ok 4 - tests/exchange.test.mjs
# not ok 9 - tests/settings.test.mjs
# tests 84 / pass 82 / fail 2
```

**GREEN**, `npm test`: `# tests 112 / pass 112 / fail 0`.
**Build**: `✓ built in 3.03s`.

## Test specification (round 2)

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 12 | A malformed stored value falls back instead of yielding NaN (`''`, `'abc'`, `'₱64'`, `null`, `{}`, `[]`) | `tests/settings.test.mjs:a malformed stored value falls back…` | unit | PASS |
| 13 | A partially numeric value (`'64abc'`) is rejected, not truncated to 64 | `tests/settings.test.mjs:a partially numeric value is rejected…` | unit | PASS |
| 14 | A stored `0` is honoured (waived fee, 0% discount), not replaced by the fallback | `tests/settings.test.mjs:a stored zero is honoured…` | unit | PASS |
| 15 | Negative and non-finite values fall back | `tests/settings.test.mjs:a non-finite or negative value falls back` | unit | PASS |
| 16 | Booleans are not treated as numbers (`Number(true)` is 1 — a ₱1/$1 rate) | `tests/settings.test.mjs:booleans are not treated as numbers` | unit | PASS |
| 17 | `resolveRate` falls back for `NaN`/`0`/negative/`Infinity`/blank/non-numeric | `tests/exchange.test.mjs:resolveRate falls back…` | unit | PASS |
| 18 | A broken saved rate never produces a NaN or Infinity shipping fee | `tests/exchange.test.mjs:a broken saved rate never produces…` | unit | PASS |
| 19 | A USD cart prefers an explicit USD fee, else converts the peso fee | `tests/exchange.test.mjs:a USD cart prefers…` / `…converts the peso fee…` | unit | PASS |
| 20 | A free or missing shipping fee stays `0` rather than becoming NaN | `tests/exchange.test.mjs:a free or missing shipping fee…` | unit | PASS |
| 21 | A row with no usable peso price is skipped, never priced at $0 | `tests/exchange.test.mjs:a product with no usable peso price…` | unit | PASS |
| 22 | An unusable rate skips the row rather than pricing it at $0 | `tests/exchange.test.mjs:an unusable rate skips the row…` | unit | PASS |

## Coverage (round 2)

```
#   exchange.ts | 100.00 | 100.00 | 100.00
#   settings.ts | 100.00 | 100.00 | 100.00
#   pricing.ts  |  48.99 | 100.00 |   9.09
```

## A process failure worth recording

Round 1's commit `62dd6aa` was **wrong when committed even though the working
tree was right**. To keep unrelated in-flight work out of the commit, the change
was staged with `git apply --cached --unidiff-zero`; the zero-context hunks
mis-anchored and swapped the two `.select()` column lists in the USD → PHP
handler (`products` asking for `price`, `product_variations` for `base_price` —
neither column exists, so the tool would have failed at runtime). The
verification at the time ran `npm test` and `npm run build` against the
**working tree**, which was correct, so the fault was invisible.

Corrected in `b7a4c62`. Two rules follow from it:

1. Stage partial changes with **context-anchored** hunks (`git diff -U3`), never
   `--unidiff-zero`.
2. When index and working tree differ, verify the **index**: materialise it with
   `git checkout-index -a --prefix=<tmp>/` and run tsc, tests and the build
   against that copy. This is what caught the swap, and it also caught a second
   broken attempt before it was committed.

## Known gaps (round 2)

- `src/lib/pricing.ts` remains at 49% lines / 9% functions — unchanged, out of scope.
- `Checkout` and `AdminDashboard` handlers still have no integration test; the
  decisions they make are covered as pure functions, the Supabase loops are not.
- `OrdersManager.tsx:79-80` and `AdminDashboard.tsx:636-637` still carry their
  own `150` / `3` literals rather than the shared constants. Harmless today
  because the boundary now guarantees a usable number, but they should adopt
  `DEFAULT_ADMIN_FEE_PHP` / `_USD`.
- `useSiteSettings.ts` imports the `SiteSetting` type without using it, and
  `Checkout.tsx` destructures `getShippingFee` without using it. Both predate
  this work and still produce `tsc` TS6133 errors.

## Merge evidence (round 2)

| Commit | Stage | Evidence |
|--------|-------|----------|
| `8fc7938` | RED | `test: add reproducers for the NaN checkout total and $0 USD price` — 84/82/2 quoted in the body |
| `b7a4c62` | GREEN | `fix: guard the saved rate at the boundary and skip $0 USD prices` — 112/112, build, and the index verification quoted in the body |

No refactor commit: nothing needed cleanup after GREEN.

Unrelated in-flight work was again kept out: the MOQ/kit panel in
`AdminDashboard.tsx`, the MOQ helpers in `Checkout.tsx`, and the pending
`DEFAULT_USD_PHP_RATE` 56 → 64 edit in `exchange.ts` remain uncommitted. The
`useSiteSettings.ts` hunks could not be separated from that rate centralisation
without producing a file that does not compile, so they are included.
