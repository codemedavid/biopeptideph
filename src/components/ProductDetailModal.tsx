import React, { useState } from 'react';
import { X, Package, Beaker, ShoppingCart, Plus, Minus, Sparkles } from 'lucide-react';
import type { Product, ProductVariation } from '../types';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, variation: ProductVariation | undefined, quantity: number) => void;
}

// QuantityInput component for handling numeric input with string state
const QuantityInput: React.FC<{
  value: number;
  max: number;
  onChange: (val: number) => void;
  onBlur?: () => void;
  className?: string;
}> = ({ value, max, onChange, onBlur, className }) => {
  const [localValue, setLocalValue] = useState<string>(value.toString());

  // Sync local value when prop changes (e.g. +/- buttons)
  React.useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);

    if (newVal === '') return;

    const parsed = parseInt(newVal);
    if (!isNaN(parsed) && parsed > 0) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    let parsed = parseInt(localValue);
    if (isNaN(parsed) || parsed < 1) {
      parsed = 1;
    } else if (max > 0 && parsed > max) {
      // Optional: alert or just clamp
      parsed = max;
    }

    setLocalValue(parsed.toString());
    onChange(parsed);
    if (onBlur) onBlur();
  };

  return (
    <input
      type="number"
      min="1"
      max={max > 0 ? max : 999}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
};

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onAddToCart }) => {
  // Select first available variation, or first variation if all are out of stock
  const getFirstAvailableVariation = () => {
    if (!product.variations || product.variations.length === 0) return undefined;
    const available = product.variations.find(v => v.stock_quantity > 0);
    return available || product.variations[0];
  };

  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    getFirstAvailableVariation()
  );
  const [quantity, setQuantity] = useState(1);

  const hasDiscount = product.discount_active && product.discount_price;
  const currentPrice = selectedVariation?.price || (hasDiscount ? product.discount_price! : product.base_price);
  const showPurity = Boolean(product.purity_percentage);

  // Check if product has any available stock
  const hasAnyStock = product.variations && product.variations.length > 0
    ? product.variations.some(v => v.stock_quantity > 0)
    : product.stock_quantity > 0;

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => prev > 1 ? prev - 1 : 1);

  const handleAddToCart = () => {
    onAddToCart(product, selectedVariation, quantity);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden my-2 sm:my-8">
        {/* Header */}
        <div className="bg-white text-theme-text p-3 sm:p-4 md:p-6 relative border-b border-gray-100">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-theme-accent"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
          </button>
          <div className="pr-10 sm:pr-12">
            <h2 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1.5 sm:mb-2 text-theme-text">{product.name}</h2>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-wrap">
              {showPurity && (
                <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-semibold bg-theme-secondary/10 text-theme-secondary border border-theme-secondary/20">
                  <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 mr-0.5 sm:mr-1" />
                  {product.purity_percentage}% Pure
                </span>
              )}
              {product.featured && (
                <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-semibold bg-theme-secondary/10 text-theme-secondary border border-theme-secondary/20">
                  ⭐ Featured
                </span>
              )}
              {hasDiscount && (
                <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-semibold bg-theme-secondary/10 text-theme-secondary border border-theme-secondary/20">
                  🎉 Sale
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4 md:p-6 overflow-y-auto max-h-[calc(95vh-180px)] sm:max-h-[calc(90vh-280px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            {/* Left Column */}
            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Product Image */}
              {product.image_url && (
                <div className="relative h-40 sm:h-48 md:h-56 lg:h-64 bg-gray-50 rounded-lg sm:rounded-xl overflow-hidden shadow-sm border border-gray-100">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-theme-text mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
                  <Beaker className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-theme-secondary" />
                  Product Description
                </h3>
                <p className="text-xs sm:text-sm md:text-base text-gray-700 leading-relaxed">{product.description}</p>
              </div>

              {/* Complete Set Inclusions */}
              {product.inclusions && product.inclusions.length > 0 && (
                <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-100">
                  <h3 className="text-sm sm:text-base md:text-lg font-bold text-theme-text mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                    <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-theme-secondary" />
                    Complete Set Includes
                  </h3>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {product.inclusions.map((item, index) => (
                      <li key={index} className="text-[11px] sm:text-xs md:text-sm text-gray-600 flex items-start gap-1.5 sm:gap-2">
                        <span className="text-theme-accent font-bold mt-0.5">✓</span>
                        <span className="flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scientific Details */}
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-100">
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-theme-text mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                  <Beaker className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-theme-secondary" />
                  Scientific Information
                </h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {showPurity && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-[11px] sm:text-xs md:text-sm">Purity:</span>
                      <span className="font-semibold text-theme-secondary text-[11px] sm:text-xs md:text-sm">{product.purity_percentage}%</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[11px] sm:text-xs md:text-sm">Storage:</span>
                    <span className="font-medium text-gray-700 text-[11px] sm:text-xs md:text-sm">{product.storage_conditions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[11px] sm:text-xs md:text-sm">Stock:</span>
                    <span className={`font-medium text-[11px] sm:text-xs md:text-sm ${(product.variations && product.variations.length > 0
                      ? product.variations.some(v => v.stock_quantity > 0)
                      : product.stock_quantity > 0)
                      ? 'text-theme-accent'
                      : 'text-red-600'
                      }`}>
                      {product.variations && product.variations.length > 0
                        ? product.variations.reduce((sum, v) => sum + v.stock_quantity, 0)
                        : product.stock_quantity} units
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Purchase Section */}
            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Price */}
              <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-gray-200 shadow-soft">
                <div className="text-center mb-3 sm:mb-4">
                  {hasDiscount && (
                    <div className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-400 line-through mb-0.5 sm:mb-1">
                      ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </div>
                  )}
                  <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-theme-secondary">
                    ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                  </div>
                  {hasDiscount && (
                    <div className="inline-block bg-theme-accent text-white px-2 py-0.5 sm:px-2.5 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-bold mt-1 sm:mt-1.5 md:mt-2 shadow-sm">
                      Save ₱{(product.base_price - product.discount_price!).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </div>
                  )}
                </div>

                {/* Size Selection */}
                {product.variations && product.variations.length > 0 && (
                  <div className="mb-3 sm:mb-4">
                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                      Select Size:
                    </label>
                    <select
                      value={selectedVariation?.id || ''}
                      onChange={(e) => {
                        const variation = product.variations?.find(v => v.id === e.target.value);
                        if (variation && variation.stock_quantity > 0) {
                          setSelectedVariation(variation);
                        }
                      }}
                      className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 border border-gray-300 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-transparent bg-white text-gray-900 font-medium text-xs sm:text-sm md:text-base shadow-sm transition-all"
                    >
                      {product.variations.map((variation) => {
                        const isOutOfStock = variation.stock_quantity === 0;
                        return (
                          <option
                            key={variation.id}
                            value={variation.id}
                            disabled={isOutOfStock}
                            className={isOutOfStock ? 'line-through text-gray-400 italic' : ''}
                          >
                            {variation.name} - ₱{variation.price.toLocaleString('en-PH')}
                            {isOutOfStock ? ' (Out of Stock)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {selectedVariation && selectedVariation.stock_quantity === 0 && (
                      <p className="text-xs text-red-600 mt-1.5 font-semibold">
                        ⚠️ This size is currently out of stock. Please select another size.
                      </p>
                    )}
                  </div>
                )}

                {/* Quantity */}
                <div className="mb-3 sm:mb-4">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2">
                    Quantity:
                  </label>
                  <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4">
                    <button
                      onClick={decrementQuantity}
                      className="p-2 sm:p-2.5 md:p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg sm:rounded-xl transition-all shadow-sm group"
                    >
                      <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-500 group-hover:text-theme-accent" />
                    </button>
                    <QuantityInput
                      value={quantity}
                      max={hasAnyStock && selectedVariation ? selectedVariation.stock_quantity : (product.stock_quantity || 999)}
                      onChange={setQuantity}
                      onBlur={() => {
                        // Additional validation if needed, mostly handled by component
                        const maxStock = selectedVariation ? selectedVariation.stock_quantity : product.stock_quantity;
                        if (maxStock > 0 && quantity > maxStock) {
                          setQuantity(maxStock);
                          // Optional alert? component clamps it silently or we can alert here
                          // The component clamps on blur, but updates parent onChange. 
                          // If component clamps, it calls onChange(max).
                          // So we might get the alert behavior if we want.
                          /* 
                          if (quantity > maxStock) {
                             alert(`Only ${maxStock} item(s) available.`);
                          }
                          */
                        }
                      }}
                      className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 w-[60px] sm:w-[70px] text-center border-none focus:ring-0 p-0 appearance-none bg-transparent no-spinner"
                    />
                    <button
                      onClick={incrementQuantity}
                      className="p-2 sm:p-2.5 md:p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg sm:rounded-xl transition-all shadow-sm group"
                    >
                      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-500 group-hover:text-theme-accent" />
                    </button>
                  </div>
                </div>

                {/* Total */}
                <div className="bg-gray-900 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 mb-3 sm:mb-4 shadow-md">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-medium text-xs sm:text-sm md:text-base">Total:</span>
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                      ₱{(currentPrice * quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* Add to Cart Button */}
                <button
                  onClick={handleAddToCart}
                  disabled={!hasAnyStock || (selectedVariation && selectedVariation.stock_quantity === 0) || (!selectedVariation && product.stock_quantity === 0)}
                  className="w-full bg-theme-accent hover:bg-theme-accent/90 text-white py-2.5 sm:py-3 md:py-4 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base md:text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                  {!hasAnyStock || (selectedVariation && selectedVariation.stock_quantity === 0) || (!selectedVariation && product.stock_quantity === 0) ? 'Out of Stock' : 'Add to Cart'}
                </button>
              </div>

              {/* Stock Alert */}
              {product.available && (product.variations && product.variations.length > 0
                ? product.variations.some(v => v.stock_quantity > 0 && v.stock_quantity < 10)
                : product.stock_quantity < 10 && product.stock_quantity > 0) && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <p className="text-xs sm:text-sm text-theme-secondary font-semibold flex items-center gap-1.5 sm:gap-2">
                      <span className="text-base sm:text-lg md:text-xl">⚠️</span>
                      Low stock! Only {product.variations && product.variations.length > 0
                        ? product.variations.reduce((sum, v) => sum + v.stock_quantity, 0)
                        : product.stock_quantity} units left
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;

