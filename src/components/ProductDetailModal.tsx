import React, { useState } from 'react';
import { X, Package, Beaker, ShoppingCart, Plus, Minus, Sparkles, Shield } from 'lucide-react';
import type { Product, ProductVariation } from '../types';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, variation: ProductVariation | undefined, quantity: number) => void;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onAddToCart }) => {
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    product.variations && product.variations.length > 0 ? product.variations[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);

  const hasDiscount = product.discount_active && product.discount_price;
  const currentPrice = selectedVariation?.price || (hasDiscount ? product.discount_price! : product.base_price);

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
        <div className="bg-gradient-to-r from-teal-500 via-emerald-600 to-green-600 text-white p-3 sm:p-4 md:p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
          </button>
          <div className="pr-10 sm:pr-12">
            <h2 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1.5 sm:mb-2">{product.name}</h2>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-wrap">
              <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-semibold bg-white/20 backdrop-blur-sm">
                <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 mr-0.5 sm:mr-1" />
                {product.purity_percentage}% Pure
              </span>
              {product.featured && (
                <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-semibold bg-yellow-400 text-yellow-900">
                  ⭐ Featured
                </span>
              )}
              {hasDiscount && (
                <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-semibold bg-pink-400 text-white">
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
                <div className="relative h-40 sm:h-48 md:h-56 lg:h-64 bg-gradient-to-br from-teal-50 to-emerald-100 rounded-lg sm:rounded-xl overflow-hidden border border-teal-200 sm:border-2">
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
                  <Beaker className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-teal-600" />
                  Product Description
                </h3>
                <p className="text-xs sm:text-sm md:text-base text-gray-700 leading-relaxed">{product.description}</p>
              </div>

              {/* Complete Set Inclusions */}
              {product.inclusions && product.inclusions.length > 0 && (
                <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-teal-200 sm:border-2">
                  <h3 className="text-sm sm:text-base md:text-lg font-bold text-teal-700 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                    <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                    Complete Set Includes
                  </h3>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {product.inclusions.map((item, index) => (
                      <li key={index} className="text-[11px] sm:text-xs md:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                        <span className="text-teal-600 font-bold mt-0.5">✓</span>
                        <span className="flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scientific Details */}
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200">
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 mb-2 sm:mb-3">Scientific Information</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[11px] sm:text-xs md:text-sm">Purity:</span>
                    <span className="font-semibold text-teal-600 text-[11px] sm:text-xs md:text-sm">{product.purity_percentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[11px] sm:text-xs md:text-sm">Storage:</span>
                    <span className="font-medium text-gray-700 text-[11px] sm:text-xs md:text-sm">{product.storage_conditions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[11px] sm:text-xs md:text-sm">Stock:</span>
                    <span className="font-medium text-gray-700 text-[11px] sm:text-xs md:text-sm">{product.stock_quantity} units</span>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="bg-blue-50 border border-blue-200 sm:border-2 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-blue-800 flex items-start gap-1.5 sm:gap-2">
                  <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Research Use Only:</strong> This product is intended for research purposes only. Not for human consumption.</span>
                </p>
              </div>
            </div>

            {/* Right Column - Purchase Section */}
            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Price */}
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-teal-300 sm:border-2">
                <div className="text-center mb-3 sm:mb-4">
                  {hasDiscount && (
                    <div className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-400 line-through mb-0.5 sm:mb-1">
                      ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </div>
                  )}
                  <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-teal-600">
                    ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                  </div>
                  {hasDiscount && (
                    <div className="inline-block bg-pink-500 text-white px-2 py-0.5 sm:px-2.5 sm:py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-bold mt-1 sm:mt-1.5 md:mt-2">
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
                        setSelectedVariation(variation);
                      }}
                      className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 border border-teal-300 sm:border-2 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 font-medium text-xs sm:text-sm md:text-base"
                    >
                      {product.variations.map((variation) => (
                        <option key={variation.id} value={variation.id}>
                          {variation.name} - ₱{variation.price.toLocaleString('en-PH')}
                          {variation.stock_quantity === 0 ? ' (Out of Stock)' : ''}
                        </option>
                      ))}
                    </select>
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
                      className="p-2 sm:p-2.5 md:p-3 bg-white border border-teal-300 sm:border-2 hover:bg-teal-50 rounded-lg sm:rounded-xl transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-teal-600" />
                    </button>
                    <span className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 min-w-[40px] sm:min-w-[50px] md:min-w-[60px] text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={incrementQuantity}
                      className="p-2 sm:p-2.5 md:p-3 bg-white border border-teal-300 sm:border-2 hover:bg-teal-50 rounded-lg sm:rounded-xl transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-teal-600" />
                    </button>
                  </div>
                </div>

                {/* Total */}
                <div className="bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 mb-3 sm:mb-4 border border-teal-200 sm:border-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium text-xs sm:text-sm md:text-base">Total:</span>
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold text-teal-600">
                      ₱{(currentPrice * quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* Add to Cart Button */}
                <button
                  onClick={handleAddToCart}
                  disabled={!product.available || (selectedVariation && selectedVariation.stock_quantity === 0)}
                  className="w-full bg-gradient-to-r from-teal-500 via-emerald-600 to-green-600 hover:from-teal-600 hover:via-emerald-700 hover:to-green-700 text-white py-2.5 sm:py-3 md:py-4 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base md:text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                  {!product.available ? 'Out of Stock' : 'Add to Cart'}
                </button>
              </div>

              {/* Stock Alert */}
              {product.available && product.stock_quantity < 10 && (
                <div className="bg-orange-50 border border-orange-300 sm:border-2 rounded-lg sm:rounded-xl p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-orange-800 font-semibold flex items-center gap-1.5 sm:gap-2">
                    <span className="text-base sm:text-lg md:text-xl">⚠️</span>
                    Only {product.stock_quantity} units left in stock!
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

