import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Package, CheckCircle, XCircle, Clock, Truck, AlertCircle, Search, RefreshCw, Eye, MessageCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMenu } from '../hooks/useMenu';

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
}

interface OrdersManagerProps {
  onBack: () => void;
}

const OrdersManager: React.FC<OrdersManagerProps> = ({ onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { refreshProducts } = useMenu();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
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

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          order_status: 'confirmed',
          payment_status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

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
      const { error } = await supabase
        .from('orders')
        .update({
          order_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;
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

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.order_status === statusFilter);
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
  }, [orders, statusFilter, searchQuery]);

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
        isProcessing={isProcessing}
      />
    );
  }

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
          </div>
        </div>

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
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Order Card Component
interface OrderCardProps {
  order: Order;
  onView: () => void;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onView, getStatusColor, getStatusIcon }) => {
  const totalItems = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const finalTotal = order.total_price + (order.shipping_fee || 0);

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-3 md:p-4 lg:p-6 border border-gray-200 hover:border-theme-accent/30 transition-all">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
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
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 text-xs md:text-sm">
            <div className="min-w-0">
              <span className="text-gray-500 text-[10px] md:text-xs">Customer</span>
              <p className="font-semibold text-gray-900 truncate">{order.customer_name}</p>
              <p className="text-[10px] md:text-xs text-gray-500 truncate">{order.customer_email}</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Items</span>
              <p className="font-semibold text-gray-900">{totalItems} item(s)</p>
              <p className="text-[10px] md:text-xs text-gray-500">{order.order_items.length} product(s)</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Total</span>
              <p className="font-semibold text-theme-secondary">₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              {order.shipping_fee && order.shipping_fee > 0 && (
                <p className="text-[10px] md:text-xs text-gray-500">+ ₱{order.shipping_fee} shipping</p>
              )}
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
  isProcessing: boolean;
}

const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({
  order,
  onBack,
  onConfirm,
  onUpdateStatus,
  isProcessing
}) => {
  const totalItems = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const finalTotal = order.total_price + (order.shipping_fee || 0);

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
                <span className="font-semibold">₱{order.total_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
              {order.shipping_fee && order.shipping_fee > 0 && (
                <div className="flex justify-between">
                  <span>Shipping Fee:</span>
                  <span className="font-semibold">₱{order.shipping_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-base md:text-lg font-bold border-t-2 border-gray-200 pt-2">
                <span>Total:</span>
                <span className="text-theme-secondary">₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
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
