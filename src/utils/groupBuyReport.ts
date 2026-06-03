// Phase 3 (#3): Auto-generated Group Buy report.
//
// Builds a multi-sheet .xlsx for supplier ordering + inventory planning when a
// Group Buy closes:
//   - "Orders"          one row per order line (who ordered what, qty, payment)
//   - "Product Summary" total quantity needed per product/variation
//   - "Totals"          total sales, orders, customers, items
//
// SheetJS (`xlsx`) is large, so it is lazy-loaded inside downloadGroupBuyReport
// (admin-only) and never ships in the storefront's initial bundle.
import type { GroupBuy } from '../types';

export interface ReportOrderItem {
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
  currency?: string | null;
  total_price: number;
  shipping_fee?: number | null;
  order_items: ReportOrderItem[];
  created_at?: string;
}

type Row = (string | number)[];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'round';
}

function shippingText(o: ReportOrder): string {
  return [o.shipping_address, o.shipping_barangay, o.shipping_city, o.shipping_state, o.shipping_zip_code]
    .filter(Boolean)
    .join(', ');
}

// Pure data prep (no xlsx dependency) — easy to reason about/test.
export function prepareGroupBuyReport(gb: GroupBuy, orders: ReportOrder[]): {
  orderRows: Row[];
  summaryRows: Row[];
  totalsRows: Row[];
  filename: string;
} {
  // ---- Orders: one row per order line ----
  const orderRows: Row[] = [
    ['Order #', 'Customer Name', 'Phone', 'Product', 'Variation', 'Quantity', 'Unit Price', 'Line Total', 'Currency', 'Payment Status', 'Shipping Location', 'Shipping Details'],
  ];
  for (const o of orders) {
    const orderNo = o.id.slice(0, 8).toUpperCase();
    if (!o.order_items || o.order_items.length === 0) {
      orderRows.push([orderNo, o.customer_name, o.customer_phone || '', '(no items)', '', 0, 0, 0, o.currency || 'PHP', o.payment_status, o.shipping_location || '', shippingText(o)]);
      continue;
    }
    for (const it of o.order_items) {
      orderRows.push([
        orderNo, o.customer_name, o.customer_phone || '', it.product_name, it.variation_name || '',
        it.quantity, it.price, it.total, o.currency || 'PHP', o.payment_status, o.shipping_location || '', shippingText(o),
      ]);
    }
  }

  // ---- Product Summary: total qty needed per product/variation ----
  const summary = new Map<string, { product: string; variation: string; qty: number; orders: Set<string> }>();
  for (const o of orders) {
    for (const it of o.order_items || []) {
      const key = `${it.product_name}||${it.variation_name || ''}`;
      const entry = summary.get(key) || { product: it.product_name, variation: it.variation_name || '', qty: 0, orders: new Set<string>() };
      entry.qty += it.quantity;
      entry.orders.add(o.id);
      summary.set(key, entry);
    }
  }
  const summaryRows: Row[] = [['Product', 'Variation', 'Total Qty Needed', 'Orders']];
  Array.from(summary.values())
    .sort((a, b) => b.qty - a.qty)
    .forEach((e) => summaryRows.push([e.product, e.variation, e.qty, e.orders.size]));

  // ---- Totals ----
  const totalItems = orders.reduce((s, o) => s + (o.order_items || []).reduce((a, it) => a + it.quantity, 0), 0);
  const customers = new Set(orders.map((o) => (o.customer_email || o.customer_phone || o.customer_name || '').toLowerCase())).size;
  const salesByCurrency = new Map<string, number>();
  const paidByCurrency = new Map<string, number>();
  for (const o of orders) {
    const cur = o.currency || 'PHP';
    salesByCurrency.set(cur, (salesByCurrency.get(cur) || 0) + (o.total_price || 0));
    if (o.payment_status === 'paid') paidByCurrency.set(cur, (paidByCurrency.get(cur) || 0) + (o.total_price || 0));
  }
  const totalsRows: Row[] = [
    ['Group Buy Report'],
    ['GB Number', gb.gb_number],
    ['Title', gb.title],
    ['Status', gb.status],
    ['Start Date', gb.start_date ? new Date(gb.start_date).toLocaleString() : '—'],
    ['End Date', gb.end_date ? new Date(gb.end_date).toLocaleString() : '—'],
    [],
    ['Total Orders', orders.length],
    ['Total Customers', customers],
    ['Total Items', totalItems],
    [],
    ['Total Sales (by currency)'],
  ];
  Array.from(salesByCurrency.entries()).forEach(([cur, amt]) => totalsRows.push([cur, amt]));
  totalsRows.push([], ['Paid Sales (by currency)']);
  Array.from(paidByCurrency.entries()).forEach(([cur, amt]) => totalsRows.push([cur, amt]));

  return { orderRows, summaryRows, totalsRows, filename: `GB-${gb.gb_number}-${slugify(gb.title)}-report.xlsx` };
}

/** Build the workbook and trigger a browser download (lazy-loads SheetJS). */
export async function downloadGroupBuyReport(gb: GroupBuy, orders: ReportOrder[]): Promise<void> {
  const XLSX = await import('xlsx');
  const { orderRows, summaryRows, totalsRows, filename } = prepareGroupBuyReport(gb, orders);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(totalsRows), 'Totals');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Product Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderRows), 'Orders');
  XLSX.writeFile(wb, filename);
}
