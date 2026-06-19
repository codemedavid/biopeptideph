import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, RefreshCw, TrendingUp, ShoppingCart, Users, DollarSign,
  Package, BarChart3, CreditCard,
} from 'lucide-react';
import { listOrders } from '../../lib/adminOrdersApi';

interface AnalyticsManagerProps {
  onBack: () => void;
}

interface AItem {
  product_name: string;
  variation_name?: string | null;
  quantity: number;
  price: number;
  total: number;
}
interface AOrder {
  id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  order_items: AItem[];
  total_price: number;
  payment_status: string;
  order_status: string;
  currency?: string | null;
  group_buy_number?: string | null;
  created_at: string;
}

type Period = 'all' | '30d' | 'month';

function money(amount: number, currency = 'PHP'): string {
  const symbol = currency === 'USD' ? '$' : '₱';
  return `${symbol}${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const SalesAnalytics: React.FC<AnalyticsManagerProps> = ({ onBack }) => {
  const [orders, setOrders] = useState<AOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await listOrders();
      setOrders((data as AOrder[]) || []);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const periodOrders = useMemo(() => {
    if (period === 'all') return orders;
    const now = new Date();
    const cutoff = period === '30d'
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    return orders.filter((o) => new Date(o.created_at) >= cutoff);
  }, [orders, period]);

  // "Revenue" counts paid orders only.
  const paidOrders = useMemo(() => periodOrders.filter((o) => o.payment_status === 'paid'), [periodOrders]);

  const stats = useMemo(() => {
    const revenueByCur = new Map<string, number>();
    let itemsSold = 0;
    for (const o of paidOrders) {
      const cur = o.currency || 'PHP';
      revenueByCur.set(cur, (revenueByCur.get(cur) || 0) + (o.total_price || 0));
      itemsSold += (o.order_items || []).reduce((a, it) => a + it.quantity, 0);
    }
    const customers = new Set(periodOrders.map((o) => (o.customer_email || o.customer_phone || o.customer_name || '').toLowerCase())).size;
    const phpRevenue = revenueByCur.get('PHP') || 0;
    const phpPaidCount = paidOrders.filter((o) => (o.currency || 'PHP') === 'PHP').length;
    return {
      revenueByCur,
      itemsSold,
      customers,
      totalOrders: periodOrders.length,
      paidOrders: paidOrders.length,
      aov: phpPaidCount > 0 ? phpRevenue / phpPaidCount : 0,
    };
  }, [paidOrders, periodOrders]);

  const bestSellers = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of paidOrders) {
      for (const it of o.order_items || []) {
        const label = it.variation_name ? `${it.product_name} (${it.variation_name})` : it.product_name;
        const e = map.get(label) || { name: label, qty: 0, revenue: 0 };
        e.qty += it.quantity;
        e.revenue += it.total || it.price * it.quantity;
        map.set(label, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [paidOrders]);

  const perGB = useMemo(() => {
    const map = new Map<string, { gb: string; orders: number; revenue: number }>();
    for (const o of periodOrders) {
      if (!o.group_buy_number) continue;
      const e = map.get(o.group_buy_number) || { gb: o.group_buy_number, orders: 0, revenue: 0 };
      e.orders += 1;
      if (o.payment_status === 'paid') e.revenue += o.total_price || 0;
      map.set(o.group_buy_number, e);
    }
    return Array.from(map.values()).sort((a, b) => b.gb.localeCompare(a.gb, undefined, { numeric: true }));
  }, [periodOrders]);

  const statusBreakdown = useMemo(() => {
    const order = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    const counts = new Map<string, number>();
    for (const o of periodOrders) counts.set(o.order_status, (counts.get(o.order_status) || 0) + 1);
    return order.filter((s) => counts.has(s)).map((s) => ({ status: s, count: counts.get(s) || 0 }));
  }, [periodOrders]);

  const maxSellerQty = Math.max(1, ...bestSellers.map((b) => b.qty));
  const maxGbRevenue = Math.max(1, ...perGB.map((g) => g.revenue));
  const maxStatus = Math.max(1, ...statusBreakdown.map((s) => s.count));

  const cards = [
    { label: 'Revenue (paid, ₱)', value: money(stats.revenueByCur.get('PHP') || 0), icon: DollarSign, color: 'text-green-600 bg-green-50' },
    { label: 'Total Orders', value: String(stats.totalOrders), icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: 'Paid Orders', value: String(stats.paidOrders), icon: CreditCard, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Avg Order Value (₱)', value: money(stats.aov), icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    { label: 'Customers', value: String(stats.customers), icon: Users, color: 'text-orange-600 bg-orange-50' },
    { label: 'Items Sold', value: String(stats.itemsSold), icon: Package, color: 'text-pink-600 bg-pink-50' },
  ];

  return (
    <div className="min-h-screen bg-theme-bg">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" /> <span className="font-medium">Back to Dashboard</span>
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-theme-accent" /> Sales Analytics
          </h1>
          <div className="flex items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}
              className="text-sm border-2 border-gray-200 rounded-lg py-1.5 px-2 bg-white">
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
            </select>
            <button onClick={fetchOrders} className="text-gray-500 hover:text-gray-800" title="Refresh">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-white rounded-xl shadow-soft border border-gray-100 p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <p className="text-xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          ))}
        </div>

        {/* USD revenue note, only when present */}
        {stats.revenueByCur.get('USD') ? (
          <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 text-sm text-gray-600">
            International revenue (paid): <span className="font-bold text-gray-900">{money(stats.revenueByCur.get('USD') || 0, 'USD')}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Best sellers */}
          <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Package className="w-4 h-4 text-theme-accent" /> Best-Selling Products</h2>
            {bestSellers.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No paid sales yet.</p>
            ) : (
              <div className="space-y-3">
                {bestSellers.map((b) => (
                  <div key={b.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700 truncate pr-2">{b.name}</span>
                      <span className="text-gray-500 flex-shrink-0">{b.qty} sold · {money(b.revenue)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-theme-accent rounded-full" style={{ width: `${(b.qty / maxSellerQty) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-GB performance */}
          <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-theme-accent" /> Group Buy Performance</h2>
            {perGB.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No group-buy orders yet.</p>
            ) : (
              <div className="space-y-3">
                {perGB.map((g) => (
                  <div key={g.gb}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">GB #{g.gb}</span>
                      <span className="text-gray-500">{g.orders} orders · {money(g.revenue)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${(g.revenue / maxGbRevenue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Order status distribution */}
        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-theme-accent" /> Orders by Status</h2>
          {statusBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No orders in this period.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {statusBreakdown.map((s) => (
                <div key={s.status} className="text-center">
                  <div className="flex items-end justify-center h-24 mb-2">
                    <div className="w-8 bg-theme-accent/80 rounded-t" style={{ height: `${(s.count / maxStatus) * 100}%` }} />
                  </div>
                  <p className="text-sm font-bold text-gray-900">{s.count}</p>
                  <p className="text-[11px] text-gray-500 capitalize">{s.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesAnalytics;
