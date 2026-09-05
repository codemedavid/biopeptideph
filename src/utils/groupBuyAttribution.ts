// Which Group Buy round an incoming order is recorded against.
//
// This is deliberately NOT "the active round". Checkout used to stamp
// group_buy_id only while a round had status 'active', so every order placed in
// the gap between the admin closing one round and opening the next was saved
// with group_buy_id = null. Those orders are invisible to the per-GB supplier
// report, which filters on group_buy_id — and nothing surfaced them, so the
// omission was silent. 59 of 741 live orders (8%) were lost to this before it
// was fixed, clustered exactly in the between-round gaps.
//
// The rule below guarantees an order is never unattributed while any round
// exists. A fallback pick can be wrong, but wrong-and-visible is recoverable
// (the admin moves it from the Orders tab); null-and-silent is not.
import type { GroupBuy } from '../types';

/**
 * Pick the round to stamp on a new order.
 *
 * @param groupBuys all rounds, ordered newest-created first (as useGroupBuys loads them)
 * @returns the open round, else the most recently created one, else null when no round exists at all
 */
export function pickAttributionGroupBuy(groupBuys: readonly GroupBuy[]): GroupBuy | null {
  return groupBuys.find((g) => g.status === 'active') ?? groupBuys[0] ?? null;
}
