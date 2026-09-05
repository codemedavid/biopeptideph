import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Package, CheckCircle, XCircle, Clock, Truck, AlertCircle, Search, RefreshCw, Eye, MessageCircle, Image as ImageIcon, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { listOrders, updateOrder, deleteOrder, bulkDeleteOrders, bulkAssignGroupBuy } from '../lib/adminOrdersApi';
import { useGroupBuys } from '../hooks/useGroupBuys';
import { useMenu } from '../hooks/useMenu';
import { useSiteSettings } from '../hooks/useSiteSettings';

interface OrderItem {
  product_id: string;
  product_name: string;
  variation_id: string | null;
  variation_name: string | null;
  quantity: number;
  price: number;
  total: number;
  purity_percentage?: number;
}

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  shipping_barangay: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip_code: string;
  shipping_country: string;
  shipping_location: string | null;
  shipping_fee: number | null;
  order_items: OrderItem[];
  total_price: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_proof_url: string | null;
  contact_method: string | null;
  order_status: string;
  payment_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  promo_code_id?: string;
  discount_amount?: number;
  pricing_mode?: 'national' | 'international';
  currency?: 'PHP' | 'USD';
  group_buy_id?: string | null;
  group_buy_number?: string | null;
}

interface OrdersManagerProps {
  onBack: () => void;
}

const OrdersManager: React.FC<OrdersManagerProps> = ({ onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [gbFilter, setGbFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmText, setBulkConfirmText] = useState('');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  // Re-attributing selected orders to a round. Needed because checkout falls back
  // to the newest round when none is active, which can pick the wrong one.
  const { groupBuys } = useGroupBuys();
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { refreshProducts } = useMenu();
  const { siteSettings } = useSiteSettings();
  const adminFeePhp = siteSettings?.admin_fee_php ?? 150;
  const adminFeeUsd = siteSettings?.admin_fee_usd ?? 3;

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await listOrders();
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      alert('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleConfirmOrder = async (order: Order) => {
    if (!confirm(`Confirm order #${order.id.slice(0, 8)}? This will deduct stock from inventory.`)) {
      return;
    }

    try {
      setIsProcessing(true);

      // First, check if all items are still in stock
      for (const item of order.order_items) {
        if (item.variation_id) {
          // Check variation stock
          const { data: variation, error: varError } = await supabase
            .from('product_variations')
            .select('stock_quantity')
            .eq('id', item.variation_id)
            .single();

          if (varError) throw varError;
          if (!variation || variation.stock_quantity < item.quantity) {
            alert(`Insufficient stock for ${item.product_name} ${item.variation_name || ''}. Available: ${variation?.stock_quantity || 0}, Required: ${item.quantity}`);
            return;
          }
        } else {
          // Check product stock
          const { data: product, error: prodError } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.product_id)
            .single();

          if (prodError) throw prodError;
          if (!product || product.stock_quantity < item.quantity) {
            alert(`Insufficient stock for ${item.product_name}. Available: ${product?.stock_quantity || 0}, Required: ${item.quantity}`);
            return;
          }
        }
      }

      // Deduct stock for each item
      for (const item of order.order_items) {
        if (item.variation_id) {
          // Deduct from variation - get current stock and update
          const { data: variation, error: varError } = await supabase
            .from('product_variations')
            .select('stock_quantity')
            .eq('id', item.variation_id)
            .single();

          if (varError) throw varError;

          if (variation) {
            const newStock = Math.max(0, variation.stock_quantity - item.quantity);
            const { error: updateError } = await supabase
              .from('product_variations')
              .update({ stock_quantity: newStock })
              .eq('id', item.variation_id);

            if (updateError) throw updateError;
          }
        } else {
          // Deduct from product - get current stock and update
          const { data: product, error: prodError } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.product_id)
            .single();

          if (prodError) throw prodError;

          if (product) {
            const newStock = Math.max(0, product.stock_quantity - item.quantity);
            const { error: updateError } = await supabase
              .from('products')
              .update({ stock_quantity: newStock })
              .eq('id', item.product_id);

            if (updateError) throw updateError;
          }
        }
      }

      // Update order status (via the admin API; orders are no longer anon-writable)
      await updateOrder(order.id, { order_status: 'confirmed', payment_status: 'paid' });

      // Refresh orders and products
      await loadOrders();
      await refreshProducts();

      // Trigger custom event to refresh inventory sales data
      window.dispatchEvent(new CustomEvent('orderConfirmed'));

      alert(`Order confirmed! Stock has been deducted from inventory.`);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error confirming order:', error);
      alert(`Failed to confirm order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      setIsProcessing(true);
      await updateOrder(orderId, { order_status: newStatus });
      await loadOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, order_status: newStatus });
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Failed to update order status. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!confirm(`Permanently delete order #${order.id.slice(0, 8).toUpperCase()} for ${order.customer_name}?\n\nThis cannot be undone. Stock will NOT be restored.`)) {
      return;
    }
    try {
      setIsDeleting(true);
      await deleteOrder(order.id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
      await loadOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      alert(`Failed to delete order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkAssign = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !assignTarget) return;
    const target = groupBuys.find((g) => g.id === assignTarget);
    const label = target ? `GB #${target.gb_number}` : 'no group buy';
    if (!window.confirm(`Move ${ids.length} order${ids.length === 1 ? '' : 's'} to ${label}? This changes the supplier report for both rounds.`)) return;
    try {
      setIsAssigning(true);
      const updated = await bulkAssignGroupBuy(ids, assignTarget || null);
      setSelectedIds(new Set());
      setAssignTarget('');
      await loadOrders();
      alert(`Moved ${updated} order${updated === 1 ? '' : 's'} to ${label}.`);
    } catch (error) {
      console.error('Error assigning group buy:', error);
      alert(`Failed to reassign orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (bulkConfirmText !== 'DELETE') return;
    try {
      setIsDeleting(true);
      await bulkDeleteOrders(ids);
      setSelectedIds(new Set());
      setBulkConfirmText('');
      setShowBulkConfirm(false);
      await loadOrders();
    } catch (error) {
      console.error('Error bulk deleting orders:', error);
      alert(`Failed to delete orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Distinct Group Buys present across orders, for the GB filter dropdown.
  const gbOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.group_buy_id) map.set(o.group_buy_id, o.group_buy_number ?? '');
    }
    return Array.from(map.entries())
      .map(([id, number]) => ({ id, number }))
      .sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true }));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by order status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.order_status === statusFilter);
    }

    // Filter by payment status
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(o => o.payment_status === paymentFilter);
    }

    // Filter by Group Buy
    if (gbFilter !== 'all') {
      filtered = gbFilter === 'none'
        ? filtered.filter(o => !o.group_buy_id)
        : filtered.filter(o => o.group_buy_id === gbFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.customer_name.toLowerCase().includes(query) ||
        o.customer_email.toLowerCase().includes(query) ||
        o.customer_phone.includes(query) ||
        o.id.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [orders, statusFilter, paymentFilter, gbFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    return {
      all: orders.length,
      new: orders.filter(o => o.order_status === 'new').length,
      confirmed: orders.filter(o => o.order_status === 'confirmed').length,
      processing: orders.filter(o => o.order_status === 'processing').length,
      shipped: orders.filter(o => o.order_status === 'shipped').length,
      delivered: orders.filter(o => o.order_status === 'delivered').length,
      cancelled: orders.filter(o => o.order_status === 'cancelled').length,
    };
  }, [orders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'confirmed': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'processing': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'shipped': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'delivered': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <Clock className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'processing': return <Package className="w-4 h-4" />;
      case 'shipped': return <Truck className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-theme-accent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading orders... ✨</p>
        </div>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <OrderDetailsView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onConfirm={() => handleConfirmOrder(selectedOrder)}
        onUpdateStatus={handleUpdateOrderStatus}
        onDelete={() => handleDeleteOrder(selectedOrder)}
        isProcessing={isProcessing}
        isDeleting={isDeleting}
        adminFeePhp={adminFeePhp}
        adminFeeUsd={adminFeeUsd}
      />
    );
  }

  const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedIds.has(o.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredOrders.forEach(o => next.delete(o.id));
      } else {
        filteredOrders.forEach(o => next.add(o.id));
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      {/* Header */}
      <div className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-12 md:h-14 gap-2">
            <div className="flex items-center space-x-2 md:space-x-4 min-w-0 flex-1">
              <button
                onClick={onBack}
                className="text-gray-700 hover:text-theme-accent transition-colors flex items-center gap-1 md:gap-2 group"
              >
                <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs md:text-sm">Dashboard</span>
              </button>
              <h1 className="text-sm md:text-base lg:text-xl font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent truncate">
                Orders Management
              </h1>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-gradient-to-r from-black to-gray-900 hover:from-gray-900 hover:to-black text-white px-2 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-medium text-xs md:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-1 md:gap-2 disabled:opacity-50 border border-gray-200"
            >
              <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 md:py-4 lg:py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3 mb-4 md:mb-6">
          <button
            onClick={() => setStatusFilter('all')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'all' ? 'border-theme-accent shadow-md' : 'border-gray-200 hover:border-theme-accent/50'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">All Orders</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{statusCounts.all}</p>
          </button>
          <button
            onClick={() => setStatusFilter('new')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'new' ? 'border-theme-accent shadow-md' : 'border-gray-200 hover:border-theme-accent/50'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">New</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-theme-secondary">{statusCounts.new}</p>
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'confirmed' ? 'border-theme-accent shadow-md' : 'border-gray-200 hover:border-theme-accent/50'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Confirmed</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{statusCounts.confirmed}</p>
          </button>
          <button
            onClick={() => setStatusFilter('processing')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'processing' ? 'border-theme-accent shadow-md' : 'border-gray-200 hover:border-theme-accent/50'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Processing</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800">{statusCounts.processing}</p>
          </button>
          <button
            onClick={() => setStatusFilter('shipped')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'shipped' ? 'border-theme-accent shadow-md' : 'border-gray-200 hover:border-theme-accent/50'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Shipped</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{statusCounts.shipped}</p>
          </button>
          <button
            onClick={() => setStatusFilter('delivered')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'delivered' ? 'border-theme-accent shadow-md' : 'border-gray-200 hover:border-theme-accent/50'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Delivered</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-green-600">{statusCounts.delivered}</p>
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'cancelled' ? 'border-red-500' : 'border-gray-200 hover:border-red-300'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Cancelled</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-red-600">{statusCounts.cancelled}</p>
          </button>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-3 md:p-4 lg:p-6 mb-4 md:mb-6 border border-gray-200">
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
              <input
                type="text"
                placeholder="Search by customer name, email, phone, or order ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2 text-sm md:text-base border-2 border-gray-200 rounded-lg focus:border-theme-accent focus:outline-none focus:ring-2 focus:ring-theme-accent/20 transition-colors"
              />
            </div>
            <select
              value={gbFilter}
              onChange={(e) => setGbFilter(e.target.value)}
              className="py-2 px-3 text-sm md:text-base border-2 border-gray-200 rounded-lg focus:border-theme-accent focus:outline-none focus:ring-2 focus:ring-theme-accent/20 bg-white"
              title="Filter by Group Buy"
            >
              <option value="all">All Group Buys</option>
              {gbOptions.map((g) => (
                <option key={g.id} value={g.id}>GB #{g.number}</option>
              ))}
              <option value="none">No Group Buy</option>
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="py-2 px-3 text-sm md:text-base border-2 border-gray-200 rounded-lg focus:border-theme-accent focus:outline-none focus:ring-2 focus:ring-theme-accent/20 bg-white"
              title="Filter by payment status"
            >
              <option value="all">All Payments</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {filteredOrders.length > 0 && (
          <div className="bg-white rounded-lg md:rounded-xl shadow-md p-3 md:p-4 mb-3 md:mb-4 border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <label className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="w-4 h-4 rounded border-gray-300 text-theme-accent focus:ring-theme-accent"
              />
              Select all visible ({filteredOrders.length})
            </label>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <span className="text-xs md:text-sm text-gray-600">{selectedIds.size} selected</span>
              {/* Re-attribute to the correct round — fixes orders taken between rounds. */}
              <select
                value={assignTarget}
                onChange={(e) => setAssignTarget(e.target.value)}
                disabled={selectedIds.size === 0 || isAssigning}
                className="py-1.5 md:py-2 px-2 md:px-3 text-xs md:text-sm border-2 border-gray-200 rounded-lg focus:border-theme-accent focus:outline-none focus:ring-2 focus:ring-theme-accent/20 bg-white disabled:opacity-40"
                title="Move the selected orders to a Group Buy"
              >
                <option value="">Move to Group Buy…</option>
                {groupBuys.map((g) => (
                  <option key={g.id} value={g.id}>GB #{g.gb_number} — {g.title}</option>
                ))}
              </select>
              <button
                onClick={handleBulkAssign}
                disabled={selectedIds.size === 0 || !assignTarget || isAssigning}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-theme-accent hover:opacity-90 text-white rounded-lg transition-opacity font-medium text-xs md:text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                {isAssigning ? 'Moving…' : 'Move'}
              </button>
              <button
                onClick={() => setShowBulkConfirm(true)}
                disabled={selectedIds.size === 0 || isDeleting}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Orders List */}
        <div className="space-y-3 md:space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-8 md:p-12 text-center border border-gray-200">
              <Package className="w-12 h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium text-base md:text-lg">No orders found</p>
              <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onView={() => setSelectedOrder(order)}
                onDelete={() => handleDeleteOrder(order)}
                isSelected={selectedIds.has(order.id)}
                onToggleSelect={() => toggleSelect(order.id)}
                isDeleting={isDeleting}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                adminFeePhp={adminFeePhp}
                adminFeeUsd={adminFeeUsd}
              />
            ))
          )}
        </div>
      </div>

      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 md:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-base md:text-lg">Delete {selectedIds.size} order{selectedIds.size === 1 ? '' : 's'}?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              This permanently deletes the selected orders. It cannot be undone. Stock levels will NOT be restored.
            </p>
            <p className="text-xs text-gray-500 mb-2">Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:</p>
            <input
              type="text"
              value={bulkConfirmText}
              onChange={(e) => setBulkConfirmText(e.target.value)}
              placeholder="DELETE"
              autoFocus
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBulkConfirm(false); setBulkConfirmText(''); }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkConfirmText !== 'DELETE' || isDeleting}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Order Card Component
interface OrderCardProps {
  order: Order;
  onView: () => void;
  onDelete: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  isDeleting: boolean;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
  adminFeePhp: number;
  adminFeeUsd: number;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onView, onDelete, isSelected, onToggleSelect, isDeleting, getStatusColor, getStatusIcon, adminFeePhp, adminFeeUsd }) => {
  const totalItems = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const isUsd = order.currency === 'USD';
  const currencySymbol = isUsd ? '$' : '₱';
  const adminFee = isUsd ? adminFeeUsd : adminFeePhp;
  const finalTotal = order.total_price + (order.shipping_fee || 0) + adminFee;

  return (
    <div className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-3 md:p-4 lg:p-6 border transition-all ${isSelected ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200 hover:border-theme-accent/30'}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex items-start gap-2 md:gap-3 pt-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label={`Select order ${order.id.slice(0, 8)}`}
            className="w-4 h-4 md:w-5 md:h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm md:text-base lg:text-lg truncate">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h3>
            <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold border flex items-center gap-1 ${getStatusColor(order.order_status)}`}>
              {getStatusIcon(order.order_status)}
              <span className="hidden sm:inline">{order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}</span>
              <span className="sm:hidden">{order.order_status.charAt(0).toUpperCase()}</span>
            </span>
            <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}>
              {order.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
            </span>
            {/* Pricing Mode Badge */}
            {order.pricing_mode && (
              <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold ${order.pricing_mode === 'international'
                  ? 'bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 border border-blue-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                {order.pricing_mode === 'international' ? '🌎 USD' : '🇵🇭 PHP'}
              </span>
            )}
            {/* Group Buy Badge */}
            {order.group_buy_number ? (
              <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold bg-theme-accent/10 text-theme-accent border border-theme-accent/20">
                GB #{order.group_buy_number}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 text-xs md:text-sm">
            <div className="min-w-0">
              <span className="text-gray-500 text-[10px] md:text-xs">Customer</span>
              <p className="font-semibold text-gray-900 truncate">{order.customer_name}</p>
              <p className="text-[10px] md:text-xs text-gray-500 truncate">{order.customer_email}</p>
              {order.shipping_barangay && (
                <p className="text-[10px] md:text-xs text-gray-500 truncate">Brgy. {order.shipping_barangay}</p>
              )}
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Items</span>
              <p className="font-semibold text-gray-900">{totalItems} item(s)</p>
              <p className="text-[10px] md:text-xs text-gray-500">{order.order_items.length} product(s)</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Total</span>
              <p className="font-semibold text-theme-secondary">{currencySymbol}{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              {order.shipping_fee && order.shipping_fee > 0 && (
                <p className="text-[10px] md:text-xs text-gray-500">+ {currencySymbol}{order.shipping_fee} shipping</p>
              )}
              <p className="text-[10px] md:text-xs text-gray-500">+ {currencySymbol}{adminFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })} admin fee</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Date</span>
              <p className="font-semibold text-gray-900">{new Date(order.created_at).toLocaleDateString()}</p>
              <p className="text-[10px] md:text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-w-[120px]">
          <button
            onClick={onView}
            className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-black to-gray-900 hover:from-gray-900 hover:to-black text-white rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center justify-center gap-1 md:gap-2 shadow-md hover:shadow-lg border border-gray-200"
          >
            <Eye className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">View Details</span>
            <span className="sm:hidden">View</span>
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="px-3 md:px-4 py-1.5 md:py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center justify-center gap-1 md:gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Order Details View Component
interface OrderDetailsViewProps {
  order: Order;
  onBack: () => void;
  onConfirm: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  onDelete: () => void;
  isProcessing: boolean;
  isDeleting: boolean;
  adminFeePhp: number;
  adminFeeUsd: number;
}

const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({
  order,
  onBack,
  onConfirm,
  onUpdateStatus,
  onDelete,
  isProcessing,
  isDeleting,
  adminFeePhp,
  adminFeeUsd
}) => {
  const totalItems = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const isUsd = order.currency === 'USD';
  const currencySymbol = isUsd ? '$' : '₱';
  const adminFee = isUsd ? adminFeeUsd : adminFeePhp;
  const finalTotal = order.total_price + (order.shipping_fee || 0) + adminFee;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      <div className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-12 md:h-14 gap-2">
            <div className="flex items-center space-x-2 md:space-x-4 min-w-0 flex-1">
              <button
                onClick={onBack}
                className="text-gray-700 hover:text-theme-accent transition-colors flex items-center gap-1 md:gap-2 group"
              >
                <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs md:text-sm">Back to Orders</span>
              </button>
              <h1 className="text-sm md:text-base lg:text-xl font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent truncate">
                Order #{order.id.slice(0, 8).toUpperCase()}
              </h1>
            </div>
            <button
              onClick={onDelete}
              disabled={isDeleting || isProcessing}
              className="px-2 md:px-4 py-1.5 md:py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 rounded-lg md:rounded-xl transition-colors font-medium text-xs md:text-sm flex items-center gap-1 md:gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{isDeleting ? 'Deleting...' : 'Delete'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 md:py-6 lg:py-8">
        <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-4 md:p-6 border border-gray-200 space-y-4 md:space-y-6">
          {/* Order Status */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
            <div>
              <span className={`inline-flex items-center px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-semibold border ${order.order_status === 'new' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                order.order_status === 'confirmed' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                  order.order_status === 'processing' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                    order.order_status === 'shipped' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                      order.order_status === 'delivered' ? 'bg-green-100 text-green-800 border-green-300' :
                        'bg-red-100 text-red-800 border-red-300'
                }`}>
                {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
              </span>
            </div>
            {order.order_status === 'new' && (
              <button
                onClick={onConfirm}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 md:px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-md hover:shadow-lg"
              >
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">{isProcessing ? 'Processing...' : 'Confirm Order & Deduct Stock'}</span>
                <span className="sm:hidden">{isProcessing ? 'Processing...' : 'Confirm Order'}</span>
              </button>
            )}
          </div>

          {/* Customer Info */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Customer Information</h3>
            <div className="bg-gray-50 rounded-lg p-3 md:p-4 space-y-1.5 md:space-y-2 text-xs md:text-sm">
              <p><span className="font-semibold">Name:</span> {order.customer_name}</p>
              <p><span className="font-semibold">Email:</span> {order.customer_email}</p>
              <p><span className="font-semibold">Phone:</span> {order.customer_phone}</p>
              {order.contact_method && (
                <p className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">Contact Method:</span>
                  <span className="flex items-center gap-1 text-green-600"><MessageCircle className="w-3 h-3 md:w-4 md:h-4" /> WhatsApp</span>
                </p>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Shipping Address</h3>
            <div className="bg-gray-50 rounded-lg p-3 md:p-4 text-xs md:text-sm">
              <p>{order.shipping_address}</p>
              {order.shipping_barangay && <p>Brgy. {order.shipping_barangay}</p>}
              <p>{order.shipping_city}, {order.shipping_state} {order.shipping_zip_code}</p>
              <p>{order.shipping_country}</p>
              {order.shipping_location && (
                <p className="mt-2"><span className="font-semibold">Region:</span> {order.shipping_location}</p>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Order Items ({totalItems} items)</h3>
            <div className="space-y-2">
              {order.order_items.map((item, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3 md:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-xs md:text-sm">
                      {item.product_name} {item.variation_name ? `- ${item.variation_name}` : ''}
                    </p>
                    <p className="text-[10px] md:text-xs text-gray-500">
                      Quantity: {item.quantity} × ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <p className="font-bold text-gray-900 text-xs md:text-sm sm:text-base">
                    ₱{item.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Proof */}
          {order.payment_proof_url && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4 md:w-5 md:h-5" />
                Payment Proof
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 md:p-4">
                <img
                  src={order.payment_proof_url}
                  alt="Payment proof"
                  className="max-w-full h-auto rounded-lg border border-gray-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = `
                      <div class="text-red-600 p-3 md:p-4 text-center text-xs md:text-sm">
                        <p>⚠️ Payment proof image failed to load</p>
                        <p class="text-[10px] md:text-xs text-gray-500 mt-2">URL: ${order.payment_proof_url}</p>
                      </div>
                    `;
                  }}
                />
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Payment Information</h3>
            <div className="bg-gray-50 rounded-lg p-3 md:p-4 space-y-1.5 md:space-y-2 text-xs md:text-sm">
              <p><span className="font-semibold">Method:</span> {order.payment_method_name || 'N/A'}</p>
              <p className="flex items-center gap-2 flex-wrap"><span className="font-semibold">Status:</span>
                <span className={`px-2 py-1 rounded-full text-[10px] md:text-xs font-semibold ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                  {order.payment_status === 'paid' ? 'Paid' : 'Pending'}
                </span>
              </p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="border-t-2 border-gray-200 pt-3 md:pt-4">
            <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">{currencySymbol}{order.total_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
              {order.shipping_fee && order.shipping_fee > 0 && (
                <div className="flex justify-between">
                  <span>Shipping Fee:</span>
                  <span className="font-semibold">{currencySymbol}{order.shipping_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Admin Fee:</span>
                <span className="font-semibold">{currencySymbol}{adminFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-base md:text-lg font-bold border-t-2 border-gray-200 pt-2">
                <span>Total:</span>
                <span className="text-theme-secondary">{currencySymbol}{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Notes</h3>
              <div className="bg-gray-50 rounded-lg p-3 md:p-4">
                <p className="text-gray-700 text-xs md:text-sm">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Status Update Buttons */}
          {order.order_status !== 'new' && order.order_status !== 'cancelled' && order.order_status !== 'delivered' && (
            <div className="border-t-2 border-gray-200 pt-3 md:pt-4">
              <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Update Status</h3>
              <div className="flex flex-wrap gap-2">
                {order.order_status === 'confirmed' && (
                  <button
                    onClick={() => onUpdateStatus(order.id, 'processing')}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gray-800 to-black hover:from-gray-900 hover:to-black text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg border border-gray-200"
                  >
                    Mark as Processing
                  </button>
                )}
                {order.order_status === 'processing' && (
                  <button
                    onClick={() => onUpdateStatus(order.id, 'shipped')}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gray-800 to-black hover:from-gray-900 hover:to-black text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg border border-gray-200"
                  >
                    Mark as Shipped
                  </button>
                )}
                {order.order_status === 'shipped' && (
                  <button
                    onClick={() => onUpdateStatus(order.id, 'delivered')}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    Mark as Delivered
                  </button>
                )}
                {(order.order_status === 'new' || order.order_status === 'confirmed' || order.order_status === 'processing') && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to cancel this order?')) {
                        onUpdateStatus(order.id, 'cancelled');
                      }
                    }}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrdersManager;
