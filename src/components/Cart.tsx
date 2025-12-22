import React, { useState, useEffect } from 'react';
import { Trash2, ShoppingBag, ArrowLeft, CreditCard, Plus, Minus, Sparkles, Heart } from 'lucide-react';
import type { CartItem } from '../types';
import { usePricingMode } from '../hooks/usePricingMode';

interface CartProps {
  cartItems: CartItem[];
  updateQuantity: (index: number, quantity: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  onContinueShopping: () => void;
  onCheckout: () => void;
}

// CartQuantityInput moved to top
const CartQuantityInput: React.FC<{
  value: number;
  max: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}> = ({ value, max, onChange, disabled }) => {
  const [localValue, setLocalValue] = useState<string>(value.toString());

  // Update local value if prop value changes (e.g. from buttons)
  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);

    // Only trigger update if it's a valid number
    if (newVal !== '') {
      const parsed = parseInt(newVal);
      if (!isNaN(parsed) && parsed > 0) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    let parsed = parseInt(localValue);
    if (isNaN(parsed) || parsed < 1) {
      parsed = 1;
    } else if (max > 0 && parsed > max) {
      if (parsed > max) {
        alert(`Only ${max} item(s) available in stock.`);
        parsed = max;
      }
    }

    setLocalValue(parsed.toString());
    onChange(parsed);
  };

  return (
    <input
      type="number"
      min="1"
      max={max > 0 ? max : 999}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className="px-2 w-16 text-center font-bold text-gray-800 text-sm md:text-base border-none focus:ring-0 bg-transparent appearance-none no-spinner"
    />
  );
};

const Cart: React.FC<CartProps> = ({
  cartItems,
  updateQuantity,
  removeFromCart,
  clearCart,
  getTotalPrice,
  onContinueShopping,
  onCheckout,
}) => {
  const { currencySymbol, pricingMode, isInternational } = usePricingMode();

  // Determine currency from cart items (they all have same currency)
  const cartCurrency = cartItems.length > 0 ? cartItems[0].currency : (pricingMode === 'national' ? 'PHP' : 'USD');
  const cartSymbol = cartCurrency === 'PHP' ? '₱' : '$';

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-md">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-12 border-2 border-blue-100">
            <div className="bg-gradient-to-br from-black to-gray-900 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border border-gray-100">
              <ShoppingBag className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3 flex items-center justify-center gap-2">
              Your cart is empty
              <Heart className="w-6 h-6 text-pink-400" />
            </h2>
            <p className="text-gray-600 mb-8">
              Start adding amazing products to your cart! ✨
            </p>
            <button
              onClick={onContinueShopping}
              className="bg-theme-accent hover:bg-theme-accent/90 text-white px-8 py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all w-full flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Browse Products
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPrice = getTotalPrice();
  // Shipping fee will be discussed via chat
  const finalTotal = totalPrice;

  return (
    <div className="min-h-screen bg-white py-6 md:py-8">
      <div className="container mx-auto px-3 md:px-4">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <button
            onClick={onContinueShopping}
            className="text-black hover:text-theme-accent font-medium mb-4 flex items-center gap-2 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm md:text-base">Continue Shopping</span>
          </button>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                Shopping Cart
                <Sparkles className="w-6 h-6 text-theme-secondary" />
              </h1>
              {/* Currency Badge */}
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${isInternational
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                  : 'bg-green-100 text-green-700'
                }`}>
                {isInternational ? '🌎 USD' : '🇵🇭 PHP'}
              </span>
            </div>
            <button
              onClick={clearCart}
              className="text-red-500 hover:text-red-600 font-medium flex items-center gap-1.5 md:gap-2 transition-colors text-sm md:text-base hover:scale-105 transform"
            >
              <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-3 md:space-y-4">
            {cartItems.map((item, index) => (
              <div
                key={index}
                className="bg-white backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl p-4 md:p-6 transition-all animate-fadeIn border border-gray-200 hover:border-theme-accent/50"
              >
                <div className="flex gap-4 md:gap-6">
                  {/* Product Image */}
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md border border-gray-300">
                    {item.product.image_url ? (
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-black to-gray-700 bg-clip-text text-transparent">
                        {item.product.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm md:text-base mb-1 truncate">
                          {item.product.name}
                        </h3>
                        {item.variation && (
                          <p className="text-xs md:text-sm text-gray-700 font-medium">
                            Variation: {item.variation.name}
                          </p>
                        )}
                        {item.product.purity_percentage && item.product.purity_percentage > 0 ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] md:text-xs font-medium bg-green-100 text-green-700">
                              {item.product.purity_percentage}% Pure
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="p-1.5 md:p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors ml-2"
                        title="Remove from cart"
                      >
                        <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                      </button>
                    </div>

                    {/* Quantity and Price */}
                    <div className="flex justify-between items-center mt-3 md:mt-4">
                      <div className="flex items-center border-2 border-gray-200 rounded-xl bg-white shadow-sm">
                        <button
                          onClick={() => updateQuantity(index, item.quantity - 1)}
                          className="p-1.5 md:p-2 hover:bg-gray-50 transition-colors rounded-l-lg"
                        >
                          <Minus className="w-3 h-3 md:w-4 md:h-4 text-black" />
                        </button>
                        <CartQuantityInput
                          value={item.quantity}
                          max={(() => {
                            const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;
                            return availableStock > 0 ? availableStock : 999;
                          })()}
                          onChange={(val) => updateQuantity(index, val)}
                          disabled={(() => {
                            // Logic for disabled? Usually not disabled unless out of stock?
                            // But item is in cart, so at least 1 exists.
                            return false;
                          })()}
                        />
                        {(() => {
                          const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;
                          if (availableStock > 0) {
                            return <span className="block text-[10px] text-gray-500 text-center">/ {availableStock}</span>;
                          }
                          return null;
                        })()}
                        <button
                          onClick={() => {
                            const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;
                            if (item.quantity >= availableStock) {
                              alert(`Only ${availableStock} item(s) available in stock.`);
                              return;
                            }
                            updateQuantity(index, item.quantity + 1);
                          }}
                          disabled={(() => {
                            const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;
                            return item.quantity >= availableStock;
                          })()}
                          className="p-1.5 md:p-2 hover:bg-gray-50 transition-colors rounded-r-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3 h-3 md:w-4 md:h-4 text-black" />
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-xl md:text-2xl font-bold text-black">
                          {cartSymbol}{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] md:text-xs text-gray-500">
                          {cartSymbol}{item.price.toLocaleString('en-PH', { minimumFractionDigits: 0 })} each
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white backdrop-blur-sm rounded-lg shadow-xl p-5 md:p-6 sticky top-24 border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
                Order Summary
                <Sparkles className="w-5 h-5 text-theme-secondary" />
              </h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-700 text-sm md:text-base">
                  <span>Subtotal ({cartItems.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
                  <span className="font-semibold">{cartSymbol}{totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                </div>
                <div className="flex flex-col gap-1 text-gray-700 text-xs md:text-sm">
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span className="text-gray-700 font-medium">Choose your location at checkout.</span>
                  </div>
                  <p className="text-gray-500">
                    Shipping rates apply to small pouches (4.1 × 9.5 inches) with a capacity of up to 3 pens. For bulk orders exceeding this size, our team will contact you for the adjusted shipping fees.
                  </p>
                </div>

                <div className="border-t-2 border-dashed border-gray-200 pt-3 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-base md:text-lg font-bold text-gray-900">Total</span>
                    <div className="text-right">
                      <span className="text-2xl md:text-3xl font-bold text-black">
                        {cartSymbol}{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                      </span>
                      <div className="text-xs text-gray-500">{cartCurrency}</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-right">+ Shipping fee (calculated on checkout)</p>
                </div>
              </div>

              <button
                onClick={onCheckout}
                className="w-full bg-theme-accent hover:bg-theme-accent/90 text-white py-3 md:py-4 rounded-lg font-semibold text-sm md:text-base shadow-lg hover:shadow-xl transform hover:scale-105 transition-all mb-3 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Proceed to Checkout
              </button>

              <button
                onClick={onContinueShopping}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-theme-accent py-2.5 md:py-3 rounded-lg font-medium text-sm md:text-base transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Continue Shopping
              </button>

              {/* Trust Badges */}
              <div className="mt-6 pt-6 border-t-2 border-dashed border-gray-200 space-y-2">
                <p className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                  <span className="text-green-500 text-lg">✓</span>
                  Secure checkout
                </p>
                <p className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                  <span className="text-green-500 text-lg">✓</span>
                  Lab-tested products
                </p>
                <p className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                  <span className="text-green-500 text-lg">✓</span>
                  Fast delivery 🚚
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};



export default Cart;
