import React, { useState, useRef } from 'react';
import MenuItemCard from './MenuItemCard';
import ProductDetailModal from './ProductDetailModal';
import type { Product, ProductVariation, CartItem, GroupBuy } from '../types';
import { Search, Filter, Package } from 'lucide-react';

interface MenuProps {
  menuItems: Product[];
  addToCart: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartItems: CartItem[];
  updateQuantity: (index: number, quantity: number) => void;
  // Products turned OFF for the active GB when behavior is "disable" (shown but not purchasable).
  unavailableProductIds?: Set<string>;
  // The currently OPEN group buy, if any. While one is open, products that are
  // NOT part of it are locked from add-to-cart and steer the user to the round.
  activeGroupBuy?: GroupBuy | null;
  onGoToGroupBuy?: () => void;
}

const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems, unavailableProductIds, activeGroupBuy, onGoToGroupBuy }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'purity'>('name');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const productsRef = useRef<HTMLDivElement | null>(null);

  // Filter products based on search
  const filteredProducts = menuItems.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'price':
        return a.base_price - b.base_price;
      case 'purity':
        return b.purity_percentage - a.purity_percentage;
      default:
        return 0;
    }
  });

  const getCartQuantity = (productId: string, variationId?: string) => {
    return cartItems
      .filter(item =>
        item.product.id === productId &&
        (variationId ? item.variation?.id === variationId : !item.variation)
      )
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  return (
    <>
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          unavailable={unavailableProductIds?.has(selectedProduct.id) ?? false}
          gbLocked={Boolean(activeGroupBuy && selectedProduct.group_buy_id !== activeGroupBuy.id)}
          gbNumber={activeGroupBuy?.gb_number ?? null}
          onGoToGroupBuy={() => {
            setSelectedProduct(null);
            onGoToGroupBuy?.();
          }}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(product, variation, quantity) => {
            addToCart(product, variation, quantity);
          }}
        />
      )}

      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-10" ref={productsRef} id="product-section">
          {/* Section heading */}
          <div className="mb-6">
            <h2 className="font-display font-extrabold text-[28px] sm:text-[30px] tracking-[-0.02em] text-theme-text flex items-center gap-3">
              <span className="text-theme-accent">🌸</span> The Collection
            </h2>
          </div>

          {/* Search and Filter Controls */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-theme-text/40 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 text-base rounded-[var(--r-md)] frost-soft text-theme-text placeholder:text-theme-text/40 focus:outline-none focus:ring-1 focus:ring-theme-accent transition-all"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-3 sm:w-auto frost-soft rounded-[var(--r-md)] px-4 py-3">
              <Filter className="text-theme-secondary w-5 h-5" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'price' | 'purity')}
                className="focus:outline-none bg-transparent font-semibold text-theme-text text-sm"
              >
                <option value="name">Sort by Name</option>
                <option value="price">Sort by Price</option>
                <option value="purity">Sort by Purity</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="mb-6 flex items-center gap-2">
            <p className="text-theme-text/50 font-medium text-sm">
              Showing <span className="font-bold text-theme-secondary">{sortedProducts.length}</span> products
            </p>
          </div>

          {/* Products Grid */}
          {sortedProducts.length === 0 ? (
            <div className="text-center py-20">
              <div className="bg-white rounded-xl shadow-soft p-12 max-w-md mx-auto border border-gray-100">
                <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Package className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-theme-text mb-2">No products found</h3>
                <p className="text-gray-500 mb-6">
                  {searchQuery
                    ? `No products match "${searchQuery}".`
                    : 'No products available.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="btn-primary"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {sortedProducts.map((product) => (
                <MenuItemCard
                  key={product.id}
                  product={product}
                  onAddToCart={addToCart}
                  cartQuantity={getCartQuantity(product.id)}
                  onProductClick={setSelectedProduct}
                  unavailable={unavailableProductIds?.has(product.id) ?? false}
                  gbLocked={Boolean(activeGroupBuy && product.group_buy_id !== activeGroupBuy.id)}
                  gbNumber={activeGroupBuy?.gb_number ?? null}
                  onGoToGroupBuy={onGoToGroupBuy}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Menu;
