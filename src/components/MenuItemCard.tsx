import React, { useState } from 'react';
import { Plus, Minus, ShoppingCart, Package } from 'lucide-react';
import type { Product, ProductVariation } from '../types';
import { usePricingMode, getPrice, getVariationPrice, formatPrice } from '../hooks/usePricingMode';

interface MenuItemCardProps {
  product: Product;
  onAddToCart: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartQuantity?: number;
  onUpdateQuantity?: (index: number, quantity: number) => void;
  onProductClick?: (product: Product) => void;
}

// QuantityInput component
const QuantityInput: React.FC<{
  value: number;
  max: number;
  onChange: (val: number) => void;
}> = ({ value, max, onChange }) => {
  const [localValue, setLocalValue] = useState<string>(value.toString());

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
    if (isNaN(parsed) || parsed < 1) parsed = 1;
    if (max > 0 && parsed > max) parsed = max;
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
      onClick={(e) => e.stopPropagation()}
      className="w-8 sm:w-10 text-center text-xs sm:text-sm font-medium text-theme-text border-none focus:ring-0 p-0 appearance-none bg-transparent no-spinner"
    />
  );
};

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  product,
  onAddToCart,
  cartQuantity = 0,
  onProductClick,
}) => {
  const { pricingMode, currencySymbol, isInternational } = usePricingMode();
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    product.variations && product.variations.length > 0 ? product.variations[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);

  // Get current price based on pricing mode
  const currentPrice = selectedVariation
    ? getVariationPrice(selectedVariation, pricingMode)
    : getPrice(product, pricingMode);

  // Calculate discount based on pricing mode
  const basePrice = selectedVariation
    ? selectedVariation.price
    : (pricingMode === 'national'
      ? (product.national_price ?? product.base_price)
      : (product.international_price ?? product.base_price));

  const hasDiscount = !selectedVariation && product.discount_active && product.discount_price && pricingMode === 'national';

  const handleAddToCart = () => {
    onAddToCart(product, selectedVariation, quantity);
    setQuantity(1);
  };

  const availableStock = selectedVariation ? selectedVariation.stock_quantity : product.stock_quantity;

  // Check if product has any available stock (either in variations or product itself)
  const hasAnyStock = product.variations && product.variations.length > 0
    ? product.variations.some(v => v.stock_quantity > 0)
    : product.stock_quantity > 0;

  const incrementQuantity = () => {
    setQuantity(prev => {
      if (prev >= availableStock) {
        alert(`Only ${availableStock} item(s) available in stock.`);
        return prev;
      }
      return prev + 1;
    });
  };

  const decrementQuantity = () => setQuantity(prev => prev > 1 ? prev - 1 : 1);

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border-t-4 border-theme-blue overflow-hidden h-full flex flex-col group relative">
      {/* Click overlay for product details */}
      <div
        onClick={() => onProductClick?.(product)}
        className="absolute inset-x-0 top-0 h-32 z-10 cursor-pointer"
        title="View details"
      />

      {/* Product Image - Reduced height for compact feel */}
      <div className="relative h-32 bg-theme-lightblue/10 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-theme-blue/30">
            <Package className="w-8 h-8" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
          {product.featured && (
            <span className="bg-theme-blue text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              Featured
            </span>
          )}
          {hasDiscount && (
            <span className="bg-theme-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              {Math.round((1 - currentPrice / product.base_price) * 100)}% OFF
            </span>
          )}
          {isInternational && (
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              🌎 USD
            </span>
          )}
        </div>

        {/* Stock Status Overlay */}
        {!hasAnyStock && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <span className="bg-theme-navy text-white px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="p-3 sm:p-5 flex-1 flex flex-col">
        <h3 className="font-bold text-theme-navy text-sm sm:text-lg mb-1 line-clamp-2 leading-tight group-hover:text-theme-blue transition-colors">{product.name}</h3>
        <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] leading-relaxed">{product.description}</p>

        {/* Variations (Sizes) */}
        <div className="mb-3 sm:mb-4 min-h-[2.5rem] sm:min-h-[3rem]">
          {product.variations && product.variations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {product.variations.slice(0, 3).map((variation) => {
                const isOutOfStock = variation.stock_quantity === 0;
                return (
                  <button
                    key={variation.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isOutOfStock) {
                        setSelectedVariation(variation);
                      }
                    }}
                    disabled={isOutOfStock}
                    className={`
                      px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md border transition-all relative z-20
                      ${selectedVariation?.id === variation.id && !isOutOfStock
                        ? 'bg-theme-navy text-white border-theme-navy shadow-sm'
                        : isOutOfStock
                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-theme-blue hover:text-theme-blue'
                      }
                    `}
                  >
                    {variation.name}
                  </button>
                );
              })}
              {product.variations.length > 3 && (
                <span className="text-[10px] sm:text-xs text-gray-400 self-center font-medium">
                  +{product.variations.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Price and Cart Actions */}
        <div className="flex flex-col gap-2 sm:gap-3 mt-1 sm:mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold text-theme-navy">
              {currencySymbol}{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
            </span>
            {hasDiscount && (
              <span className="text-xs sm:text-sm text-gray-400 line-through decoration-gray-300">
                {currencySymbol}{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative z-20">
            {/* Quantity Controls */}
            <div className="flex items-center justify-between border border-gray-200 rounded-lg bg-gray-50 sm:w-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  decrementQuantity();
                }}
                className="p-1.5 sm:p-2 hover:bg-gray-100 transition-colors rounded-l-lg text-gray-500 hover:text-theme-navy flex-1 sm:flex-none flex justify-center"
                disabled={!hasAnyStock}
              >
                <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              <div className="w-8 flex justify-center">
                <QuantityInput
                  value={quantity}
                  max={availableStock}
                  onChange={setQuantity}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  incrementQuantity();
                }}
                className="p-1.5 sm:p-2 hover:bg-gray-100 transition-colors rounded-r-lg text-gray-500 hover:text-theme-navy flex-1 sm:flex-none flex justify-center"
                disabled={quantity >= availableStock || !hasAnyStock}
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>

            {/* Add to Cart Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (quantity > availableStock) {
                  alert(`Only ${availableStock} item(s) available in stock.`);
                  setQuantity(availableStock);
                  return;
                }
                handleAddToCart();
              }}
              disabled={!hasAnyStock || availableStock === 0}
              className="flex-1 min-w-0 bg-theme-blue text-white px-3 py-2 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:bg-theme-blue/90 hover:shadow-lg hover:shadow-theme-blue/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group/btn"
            >
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 group-hover/btn:scale-110 transition-transform" />
              <span>Add</span>
            </button>
          </div>

          {/* Cart Status */}
          {cartQuantity > 0 && (
            <div className="text-center text-xs text-theme-blue font-medium bg-theme-blue/5 py-1 rounded-md">
              {cartQuantity} in cart
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MenuItemCard;
