// MOQ + Bunuan business rules.
//
// This module is the TypeScript half of a deliberate pair. Every rule here also
// exists in SQL (supabase/migrations/20260922000002_kit_functions.sql), because
// the database is the authority — the browser copy exists only so the UI can
// disable a button and explain why BEFORE the customer reaches checkout.
//
// The two copies are kept honest by tests/kitRules.test.mjs, which runs the same
// table of cases against both. If you change a rule here, change it there.
//
// Everything below is pure: no React, no network, no Date.now(). That is what
// makes it testable and what keeps the rules in one readable place.

export type GroupBuyPhase =
  | 'upcoming'       // Draft — not customer-visible
  | 'active'         // Normal Ordering Open  — MOQ enforced
  | 'closed'         // Normal Ordering Closed — no new orders
  | 'bunuan_open'    // Bunuan Open — MOQ suspended, only the shortfall sellable
  | 'bunuan_closed'  // Bunuan Closed — no new orders
  | 'completed';     // Round finished

/** A MOQ of 1 is indistinguishable from no minimum, so both mean "no floor". */
export const NO_MOQ = 1;

export interface KitState {
  /** null = product is not kit-tracked and never enters Bunuan. */
  kitSize: number | null;
  eligibleQty: number;
  completeKits: number;
  /** Units sitting in the unfinished kit — the "8" in "8 / 10". */
  inProgress: number;
  /** Raw shortfall: what the kit needs, ignoring admin switches. */
  bunuanNeeded: number;
  /** What may actually be sold right now (0 if an admin switched Bunuan off). */
  bunuanAvailable: number;
  isComplete: boolean;
}

export type CartLineIssue =
  | 'BELOW_MOQ'
  | 'BUNUAN_EXCEEDS_REMAINING'
  | 'BUNUAN_KIT_COMPLETE'
  | 'BUNUAN_DISABLED';

export interface CartLineVerdict {
  ok: boolean;
  issue?: CartLineIssue;
  message?: string;
  /** BELOW_MOQ: how many more units are needed to reach the minimum. */
  shortBy?: number;
  /** Bunuan: the largest quantity currently allowed for this line. */
  maxAllowed?: number;
}

// ---------------------------------------------------------------------------
// Identity normalisation — mirrors gb_norm_* in SQL
// ---------------------------------------------------------------------------
// Bunuan eligibility requires name AND email AND phone to match an earlier
// order. With no customer accounts these typed strings are the only identity
// available, so normalisation is doing the real work and must match the SQL
// character for character.

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Reduce a phone number to its last 10 digits so the formats customers actually
 * type — `0927 382 3893`, `+639273823893`, `63 927 382 3893` — all compare equal.
 */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

const ACCENTS = 'áàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ';
const PLAIN = 'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC';

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(value: string | null | undefined): string {
  const lowered = (value ?? '').toLowerCase();
  let unaccented = '';
  for (const ch of lowered) {
    const i = ACCENTS.indexOf(ch);
    unaccented += i === -1 ? ch : PLAIN[i];
  }
  return unaccented
    .replace(/[^a-z0-9 ]/g, '') // "Ma." -> "ma"
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Which orders count — mirrors gb_order_counts_toward_kit in SQL
// ---------------------------------------------------------------------------
// This project has TWO independent free-text status columns, not one enum.
// An unpaid `pending` order DOES count: a Group Buy is a preorder, so the kit is
// sized against commitments. Matches countsAsPlaced() in utils/groupBuyReport.ts,
// which already sizes the supplier report the same way.
const DEAD_ORDER_STATUSES = new Set(['cancelled', 'canceled', 'refunded', 'expired']);
const DEAD_PAYMENT_STATUSES = new Set(['failed', 'refunded']);

export function countsTowardKit(
  orderStatus: string | null | undefined,
  paymentStatus: string | null | undefined,
): boolean {
  return (
    !DEAD_ORDER_STATUSES.has((orderStatus ?? '').toLowerCase()) &&
    !DEAD_PAYMENT_STATUSES.has((paymentStatus ?? '').toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Effective rules — mirrors gb_effective_moq / gb_effective_kit_size in SQL
// ---------------------------------------------------------------------------

/** Per-round override wins over the product default. Never returns < 1. */
export function effectiveMoq(
  productMoq: number | null | undefined,
  override?: number | null,
): number {
  const value = override ?? productMoq ?? NO_MOQ;
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : NO_MOQ;
}

/**
 * Per-round override wins over the product default. null propagates on purpose —
 * a product with no kit size is not kit-tracked and must never enter Bunuan.
 */
export function effectiveKitSize(
  productKitSize: number | null | undefined,
  override?: number | null,
): number | null {
  const value = override ?? productKitSize ?? null;
  if (value === null || !Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

// ---------------------------------------------------------------------------
// Kit arithmetic — mirrors gb_kit_state in SQL
// ---------------------------------------------------------------------------

export interface KitStateInput {
  kitSize: number | null;
  eligibleQty: number;
  /** Admin switch: keep this product out of Bunuan for this round. */
  bunuanEnabled?: boolean;
  /** Admin switch: treat the kit as finished regardless of the arithmetic. */
  manuallyCompleted?: boolean;
}

/**
 * The whole Bunuan calculation:
 *   completeKits = qty / kitSize
 *   inProgress   = qty % kitSize
 *   bunuanNeeded = kitSize - inProgress, or 0 when the remainder is 0
 *
 * Worked example from the spec — kitSize 10, qty 27:
 *   2 complete kits, 7 in progress, 3 needed.
 */
export function computeKitState(input: KitStateInput): KitState {
  const kitSize = effectiveKitSize(input.kitSize);
  const eligibleQty = Math.max(0, Math.floor(input.eligibleQty || 0));
  const bunuanEnabled = input.bunuanEnabled !== false;
  const manuallyCompleted = input.manuallyCompleted === true;

  // Not kit-tracked: never owed anything, never shown in Bunuan.
  if (kitSize === null) {
    return {
      kitSize: null,
      eligibleQty,
      completeKits: 0,
      inProgress: 0,
      bunuanNeeded: 0,
      bunuanAvailable: 0,
      isComplete: true,
    };
  }

  const completeKits = Math.floor(eligibleQty / kitSize);
  const inProgress = eligibleQty % kitSize;
  // A remainder of 0 means the last kit closed exactly — nothing is needed.
  const bunuanNeeded = inProgress === 0 ? 0 : kitSize - inProgress;
  const isComplete = inProgress === 0 || manuallyCompleted;

  return {
    kitSize,
    eligibleQty,
    completeKits,
    inProgress,
    bunuanNeeded,
    // Reported separately from bunuanNeeded so the admin view can say
    // "short by 3, but Bunuan is disabled" instead of just showing 0.
    bunuanAvailable: isComplete || !bunuanEnabled ? 0 : bunuanNeeded,
    isComplete,
  };
}

// ---------------------------------------------------------------------------
// Cart validation
// ---------------------------------------------------------------------------

/**
 * True in the two phases where a round is formally open.
 *
 * This is NOT "may the customer check out". The store has always kept taking
 * orders between rounds, attributing them to the most recent one — see
 * utils/groupBuyAttribution.ts and the 59 orders that were lost before it
 * existed. Cart validation therefore never blocks on the phase; it only decides
 * WHICH rules apply.
 */
export function isOrderingPhase(phase: GroupBuyPhase): boolean {
  return phase === 'active' || phase === 'bunuan_open';
}

export interface CartLineInput {
  productId: string;
  productName: string;
  quantity: number;
  moq: number;
  kitState: KitState;
}

/**
 * Validate ONE cart line against the round's current phase.
 *
 * During Bunuan the MOQ is suspended entirely — the point of Bunuan is to let
 * someone buy a single vial — and the shortfall becomes a ceiling instead.
 *
 * EVERY other phase applies the MOQ floor, including the gap between rounds.
 * The phase is not a gate: blocking checkout whenever no round happened to be
 * open would close the store during exactly the window that already cost this
 * project 59 orders, and place_group_buy_order is written the same way.
 */
export function validateCartLine(line: CartLineInput, phase: GroupBuyPhase): CartLineVerdict {
  const quantity = Math.max(0, Math.floor(line.quantity || 0));

  if (phase === 'bunuan_open') {
    const { kitState } = line;

    if (kitState.isComplete) {
      return {
        ok: false,
        issue: 'BUNUAN_KIT_COMPLETE',
        message: `${line.productName} is already complete and is no longer available.`,
        maxAllowed: 0,
      };
    }

    if (kitState.bunuanAvailable <= 0) {
      return {
        ok: false,
        issue: 'BUNUAN_DISABLED',
        message: `${line.productName} is not available in this Bunuan round.`,
        maxAllowed: 0,
      };
    }

    if (quantity > kitState.bunuanAvailable) {
      const unit = kitState.bunuanAvailable === 1 ? 'vial' : 'vials';
      return {
        ok: false,
        issue: 'BUNUAN_EXCEEDS_REMAINING',
        message: `Only ${kitState.bunuanAvailable} ${unit} left to complete this kit.`,
        maxAllowed: kitState.bunuanAvailable,
      };
    }

    // MOQ deliberately not applied in Bunuan.
    return { ok: true, maxAllowed: kitState.bunuanAvailable };
  }

  // Normal ordering, and every phase that is not Bunuan — MOQ is a floor.
  const moq = effectiveMoq(line.moq);
  if (moq > NO_MOQ && quantity < moq) {
    const shortBy = moq - quantity;
    const unit = shortBy === 1 ? 'vial' : 'vials';
    return {
      ok: false,
      issue: 'BELOW_MOQ',
      message: `Minimum order for ${line.productName} is ${moq} vials. Please add ${shortBy} more ${unit} to continue.`,
      shortBy,
    };
  }

  return { ok: true };
}

export interface CartVerdict {
  canCheckout: boolean;
  /** Keyed by productId so the UI can show the error beside the right line. */
  byProduct: Record<string, CartLineVerdict>;
}

/**
 * Validate a whole cart. Every line is checked, not just the first failure, so
 * the customer sees every problem at once instead of fixing them one reload at
 * a time.
 */
export function validateCart(lines: readonly CartLineInput[], phase: GroupBuyPhase): CartVerdict {
  const byProduct: Record<string, CartLineVerdict> = {};
  let canCheckout = lines.length > 0;

  for (const line of lines) {
    const verdict = validateCartLine(line, phase);
    byProduct[line.productId] = verdict;
    if (!verdict.ok) canCheckout = false;
  }

  return { canCheckout, byProduct };
}

/**
 * The quantity a `+` button may climb to for one line: the Bunuan shortfall
 * during Bunuan, otherwise unbounded (stock is clamped separately by the cart,
 * which already owns that rule).
 */
export function maxQuantityFor(kitState: KitState, phase: GroupBuyPhase): number | null {
  if (phase !== 'bunuan_open') return null;
  return kitState.bunuanAvailable;
}

/** The floor a `−` button may fall to: the MOQ during normal ordering, else 1. */
export function minQuantityFor(moq: number, phase: GroupBuyPhase): number {
  if (phase === 'bunuan_open') return 1; // MOQ is suspended in Bunuan
  return effectiveMoq(moq);
}
