// Phase 3 (#3): Auto-generated Group Buy report.
//
// Builds a multi-sheet .xlsx for supplier ordering + inventory planning when a
// Group Buy closes:
//   - "Orders"          one row per order line (who ordered what, qty, payment)
//   - "Product Summary" kits + vials to order per product/variation
//   - "Totals"          total sales, orders, customers, items
//
// SheetJS (`xlsx`) is large, so it is lazy-loaded inside downloadGroupBuyReport
// (admin-only) and never ships in the storefront's initial bundle.
import type { GroupBuy } from '../types';
import { itemUnitPrice, itemLineTotal } from '../lib/orderItemMoney.ts';
import { countsTowardKit, kitKey } from '../lib/kitRules.ts';

export interface ReportOrderItem {
  product_id?: string | null;
  variation_id?: string | null;
  product_name: string;
  variation_name?: string | null;
  quantity: number;
  price: number;
  total: number;
}

export interface ReportOrder {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  shipping_address?: string | null;
  shipping_barangay?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip_code?: string | null;
  shipping_location?: string | null;
  payment_status: string;
  order_status?: string | null;
  currency?: string | null;
  total_price: number;
  shipping_fee?: number | null;
  order_items: ReportOrderItem[];
  created_at?: string;
  /** Short per-round order number, e.g. "GB14-007" (added 20260922000004). */
  gb_order_code?: string | null;
}

type Row = (string | number)[];

/**
 * Kit size per kitKey(product_id, variation_id), as the Kits & MOQ panel
 * resolves it (round override -> variation -> product). A missing entry or null
 * means the line is not kit-tracked, and its kit columns are left blank.
 */
export type KitSizes = ReadonlyMap<string, number | null>;

/**
 * The supplier sells whole kits, so a part-filled kit is still a kit to buy:
 * 156 vials at 10 per kit is 16 kits with 4 vials spare, not 15.
 */
export function kitsToOrder(vials: number, kitSize: number | null | undefined): { kits: number; spare: number } | null {
  if (!kitSize || kitSize < 1) return null;
  const kits = Math.ceil(vials / kitSize);
  return { kits, spare: kits * kitSize - vials };
}

// A group buy's headline numbers are supplier DEMAND: every order a customer
// actually placed counts toward the quantities/totals, even a brand-new unpaid
// one, because that is what the supplier order is sized against. The only orders
// that must never inflate demand are dead ones (cancelled/refunded/expired, or a
// failed/refunded payment). (See the Orders sheet: every order is still listed —
// the "Counted" column shows which ones fed the Summary/Totals.)
//
// This is the SAME rule the Kits & MOQ panel counts with, so the supplier report
// and the kit counts can never disagree about which orders exist.
export function countsAsPlaced(o: ReportOrder): boolean {
  return countsTowardKit(o.order_status, o.payment_status);
}

// An order is "committed" (a firm sale, reported alongside demand) when it is
// paid or the admin has moved it past the initial "new" state
// (confirmed/processing/etc.). Cancelled/refunded is never committed.
const COMMITTED_STATUSES = new Set(['confirmed', 'processing', 'shipped', 'delivered', 'completed']);

export function countsForSupplier(o: ReportOrder): boolean {
  if (!countsAsPlaced(o)) return false;
  return o.payment_status === 'paid' || COMMITTED_STATUSES.has((o.order_status || '').toLowerCase());
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'round';
}

function shippingText(o: ReportOrder): string {
  return [o.shipping_address, o.shipping_barangay, o.shipping_city, o.shipping_state, o.shipping_zip_code]
    .filter(Boolean)
    .join(', ');
}

/**
 * What one supplier line is counted against: the product/variation ids, exactly
 * as the Kits & MOQ panel keys it. Names are only display text — an admin
 * renaming "Lily" to "LILY" mid-round must not split one supplier line in two.
 * Legacy lines with no product_id fall back to their names.
 */
function summaryKey(it: ReportOrderItem): string {
  if (it.product_id) return `id:${it.product_id}:${it.variation_id || ''}`;
  return `name:${it.product_name}||${it.variation_name || ''}`;
}

// Pure data prep (no xlsx dependency) — easy to reason about/test.
export function prepareGroupBuyReport(gb: GroupBuy, orders: ReportOrder[], kitSizes: KitSizes = new Map()): {
  orderRows: Row[];
  summaryRows: Row[];
  totalsRows: Row[];
  filename: string;
} {
  // ---- Orders: one row per order line ----
  // Every order is listed (cancelled/unpaid included for the audit trail); the
  // "Counted" column flags whether it fed the Summary/Totals (see countsForSupplier).
  const orderRows: Row[] = [
    ['Order #', 'Customer Name', 'Phone', 'Product', 'Variation', 'Quantity', 'Unit Price', 'Line Total', 'Currency', 'Order Status', 'Payment Status', 'Counted', 'Shipping Location', 'Shipping Details'],
  ];
  for (const o of orders) {
    // The per-round number is what the customer and the supplier thread both
    // quote. The uuid stub is the fallback for orders placed before that column
    // existed, or for one that is not attributed to any round.
    const orderNo = o.gb_order_code || o.id.slice(0, 8).toUpperCase();
    const orderStatus = o.order_status || '';
    // "Counted" = fed the Summary/Totals demand numbers (every placed order;
    // only cancelled/refunded are 'No'). Commit state is visible in the adjacent
    // Order Status / Payment Status columns.
    const counted = countsAsPlaced(o) ? 'Yes' : 'No';
    if (!o.order_items || o.order_items.length === 0) {
      orderRows.push([orderNo, o.customer_name, o.customer_phone || '', '(no items)', '', 0, 0, 0, o.currency || 'PHP', orderStatus, o.payment_status, counted, o.shipping_location || '', shippingText(o)]);
      continue;
    }
    for (const it of o.order_items) {
      orderRows.push([
        orderNo, o.customer_name, o.customer_phone || '', it.product_name, it.variation_name || '',
        it.quantity, itemUnitPrice(it) ?? '', itemLineTotal(it) ?? '', o.currency || 'PHP', orderStatus, o.payment_status, counted, o.shipping_location || '', shippingText(o),
      ]);
    }
  }

  // Demand = every placed (non-cancelled) order. Committed = the paid/confirmed
  // subset, reported alongside so finance numbers stay visible.
  const placedOrders = orders.filter(countsAsPlaced);
  const committedOrders = orders.filter(countsForSupplier);
  const cancelledCount = orders.length - placedOrders.length;

  // ---- Product Summary: total qty needed per product/variation ----
  // qty = demand (all placed orders); committedQty = paid/confirmed subset.
  // Orders arrive newest first, so the first name seen for a key is the current one.
  const summary = new Map<string, { product: string; variation: string; kitSize: number | null; qty: number; committedQty: number; orders: Set<string> }>();
  for (const o of placedOrders) {
    const isCommitted = countsForSupplier(o);
    for (const it of o.order_items || []) {
      const key = summaryKey(it);
      const kitSize = it.product_id ? kitSizes.get(kitKey(it.product_id, it.variation_id)) ?? null : null;
      const entry = summary.get(key) || { product: it.product_name, variation: it.variation_name || '', kitSize, qty: 0, committedQty: 0, orders: new Set<string>() };
      entry.qty += it.quantity;
      if (isCommitted) entry.committedQty += it.quantity;
      entry.orders.add(o.id);
      summary.set(key, entry);
    }
  }
  // "No. of Customer Orders" is how many orders contain the line — it is NOT a
  // kit count. It used to be headed just "Orders" and was read as kits.
  const summaryRows: Row[] = [['Product', 'Variation', 'Kits to Order', 'Kit Size', 'Total Vials Needed', 'Spare Vials (last kit)', 'Committed Vials', 'No. of Customer Orders']];
  let totalKits = 0;
  Array.from(summary.values())
    .sort((a, b) => b.qty - a.qty)
    .forEach((e) => {
      const kits = kitsToOrder(e.qty, e.kitSize);
      if (kits) totalKits += kits.kits;
      summaryRows.push([e.product, e.variation, kits?.kits ?? '', e.kitSize ?? '', e.qty, kits?.spare ?? '', e.committedQty, e.orders.size]);
    });

  // ---- Totals ---- headline = demand (placed); committed reported alongside.
  const countItems = (list: ReportOrder[]) =>
    list.reduce((s, o) => s + (o.order_items || []).reduce((a, it) => a + it.quantity, 0), 0);
  const totalItems = countItems(placedOrders);
  const committedItems = countItems(committedOrders);
  const customers = new Set(placedOrders.map((o) => (o.customer_email || o.customer_phone || o.customer_name || '').toLowerCase())).size;
  const salesByCurrency = new Map<string, number>();
  const committedByCurrency = new Map<string, number>();
  for (const o of placedOrders) {
    const cur = o.currency || 'PHP';
    salesByCurrency.set(cur, (salesByCurrency.get(cur) || 0) + (o.total_price || 0));
  }
  for (const o of committedOrders) {
    const cur = o.currency || 'PHP';
    committedByCurrency.set(cur, (committedByCurrency.get(cur) || 0) + (o.total_price || 0));
  }
  const totalsRows: Row[] = [
    ['Group Buy Report'],
    ['GB Number', gb.gb_number],
    ['Title', gb.title],
    ['Status', gb.status],
    ['Start Date', gb.start_date ? new Date(gb.start_date).toLocaleString() : '—'],
    ['End Date', gb.end_date ? new Date(gb.end_date).toLocaleString() : '—'],
    [],
    ['Note', 'Headline counts = every order placed (supplier demand). "Committed" rows count only paid or confirmed+ orders. Cancelled/refunded/expired orders and failed/refunded payments are listed in the Orders sheet but excluded from all counts.'],
    ['Placed Orders', placedOrders.length],
    ['Cancelled Orders', cancelledCount],
    ['Total Customers', customers],
    ['Total Items', totalItems],
    ['Total Kits to Order', totalKits],
    ['Committed Orders', committedOrders.length],
    ['Committed Items', committedItems],
    [],
    ['Total Sales (by currency)'],
  ];
  Array.from(salesByCurrency.entries()).forEach(([cur, amt]) => totalsRows.push([cur, amt]));
  totalsRows.push([], ['Committed Sales (by currency)']);
  Array.from(committedByCurrency.entries()).forEach(([cur, amt]) => totalsRows.push([cur, amt]));

  return { orderRows, summaryRows, totalsRows, filename: `GB-${gb.gb_number}-${slugify(gb.title)}-report.xlsx` };
}

/** Build the workbook and trigger a browser download (lazy-loads SheetJS). */
export async function downloadGroupBuyReport(gb: GroupBuy, orders: ReportOrder[], kitSizes?: KitSizes): Promise<void> {
  const XLSX = await import('xlsx');
  const { orderRows, summaryRows, totalsRows, filename } = prepareGroupBuyReport(gb, orders, kitSizes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(totalsRows), 'Totals');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Product Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderRows), 'Orders');
  XLSX.writeFile(wb, filename);
}
