import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import { PricingProvider, usePricingMode } from './hooks/usePricingMode';
import Header from './components/Header';
import Hero from './components/Hero';
import CTASection from './components/CTASection';
import SubNav from './components/SubNav';
import MobileNav from './components/MobileNav';
import Menu from './components/Menu';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import FloatingCartButton from './components/FloatingCartButton';
import GroupBuyCountdown from './components/GroupBuyCountdown';
import Footer from './components/Footer';
import SnowCanvas from './components/SnowCanvas';
import AdminDashboard from './components/AdminDashboard';
import { useMenu } from './hooks/useMenu';
import { useGroupBuys } from './hooks/useGroupBuys';
import { useGroupBuyAvailability } from './hooks/useGroupBuyAvailability';
import PeptideJourney from './pages/PeptideJourney';
import AssessmentWizardV2 from './pages/AssessmentWizardV2';
import AssessmentResults from './pages/AssessmentResults';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import SmartGuide from './pages/SmartGuide';
import PeptideCheatSheet from './pages/PeptideCheatSheet';
import type { PricingMode } from './types';

// Stable empty set so "no active GB" never thrashes downstream memoization.
const EMPTY_IDS: Set<string> = new Set();

function MainApp() {
  const { menuItems } = useMenu();
  const { globalDiscount } = usePricingMode();
  const { activeGroupBuy, attributionGroupBuy } = useGroupBuys();
  // Per-GB product availability (for the active round): hide or disable OFF products.
  const { unavailableIds, behavior } = useGroupBuyAvailability(activeGroupBuy?.id);
  const cart = useCart(menuItems, globalDiscount, unavailableIds);
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout'>('menu');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  // When a GB is active, "Explore GB #N" narrows the storefront to that round's
  // products. Defaults to off so browsing is never broken if nothing is assigned.
  const [gbOnly, setGbOnly] = React.useState(false);

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    setCurrentView(view);
    // Scroll to top when changing views
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  // While a GB is open, narrow the storefront to the round and scroll to it —
  // used both by the banner and by the "can't add to cart" notice on locked
  // (non-GB) products.
  const handleGoToGroupBuy = () => {
    setGbOnly(true);
    document.getElementById('product-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Handle pricing mode change from Header
  const handlePricingModeChange = (newMode: PricingMode, hasCartItems: boolean): boolean => {
    if (hasCartItems) {
      const confirmed = window.confirm(
        'Changing currency will update prices in your cart. Continue?'
      );
      if (confirmed) {
        cart.updateCartPricingMode(newMode);
        return true;
      }
      return false;
    }
    return true;
  };

  // Filter products: optional active-GB narrowing, then category, then hide any
  // products turned OFF for this GB when the chosen behavior is "hide".
  const gbScoped = gbOnly && activeGroupBuy
    ? menuItems.filter(item => item.group_buy_id === activeGroupBuy.id)
    : menuItems;
  const categoryScoped = selectedCategory === 'all'
    ? gbScoped
    : gbScoped.filter(item => item.category === selectedCategory);
  const filteredProducts = behavior === 'hide'
    ? categoryScoped.filter(item => !unavailableIds.has(item.id))
    : categoryScoped;

  return (
    <div className="min-h-screen font-inter flex flex-col">
      <Header
        cartItemsCount={cart.getTotalItems()}
        onCartClick={() => handleViewChange('cart')}
        onMenuClick={() => handleViewChange('menu')}
        onPricingModeChange={handlePricingModeChange}
      />

      {currentView === 'menu' && (
        <>
          <SubNav selectedCategory={selectedCategory} onCategoryClick={handleCategoryClick} />
          <MobileNav activeCategory={selectedCategory} onCategoryClick={handleCategoryClick} />
        </>
      )}

      <main className="flex-grow">
        {currentView === 'menu' && (
          <>
            <Hero
              activeGbNumber={activeGroupBuy?.gb_number ?? null}
              onShopAll={() => {
                if (activeGroupBuy) setGbOnly(true);
                document.getElementById('product-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
            {activeGroupBuy && (
              <div className="bg-theme-accent/10 border-y border-theme-accent/20">
                <div className="container mx-auto px-4 py-4 flex flex-col items-center gap-3">
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                    <span className="text-sm font-semibold text-theme-accent">
                      🛒 Group Buy #{activeGroupBuy.gb_number} — {activeGroupBuy.title} is now OPEN
                    </span>
                    <button
                      onClick={() => setGbOnly((v) => !v)}
                      className="text-xs font-semibold underline text-theme-accent hover:text-theme-accent/80"
                    >
                      {gbOnly ? 'View all products' : `View GB #${activeGroupBuy.gb_number} only`}
                    </button>
                  </div>
                  {/* Owns its own 1s tick — keep it a leaf so the product grid
                      below is not re-rendered every second. */}
                  <GroupBuyCountdown
                    endDate={activeGroupBuy.end_date}
                    gbNumber={activeGroupBuy.gb_number}
                  />
                </div>
              </div>
            )}
            <Menu
              menuItems={filteredProducts}
              addToCart={cart.addToCart}
              cartItems={cart.cartItems}
              updateQuantity={cart.updateQuantity}
              unavailableProductIds={behavior === 'disable' ? unavailableIds : undefined}
              activeGroupBuy={activeGroupBuy}
              onGoToGroupBuy={handleGoToGroupBuy}
            />
            <CTASection />
          </>
        )}

        {currentView === 'cart' && (
          <Cart
            cartItems={cart.cartItems}
            updateQuantity={cart.updateQuantity}
            removeFromCart={cart.removeFromCart}
            clearCart={cart.clearCart}
            getTotalPrice={cart.getTotalPrice}
            onContinueShopping={() => handleViewChange('menu')}
            onCheckout={() => handleViewChange('checkout')}
          />
        )}

        {currentView === 'checkout' && (
          <Checkout
            cartItems={cart.cartItems}
            totalPrice={cart.getTotalPrice()}
            onBack={() => handleViewChange('cart')}
            clearCart={cart.clearCart}
            activeGroupBuy={activeGroupBuy}
            attributionGroupBuy={attributionGroupBuy}
          />
        )}
      </main>

      {currentView === 'menu' && (
        <>
          <FloatingCartButton
            itemCount={cart.getTotalItems()}
            onCartClick={() => handleViewChange('cart')}
          />
          <Footer />
        </>
      )}
    </div>
  );
}


function App() {
  return (
    <PricingProvider>
      <Router>
        <SnowCanvas />
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/journey" element={<PeptideJourney />} />
          <Route path="/assessment" element={<AssessmentWizardV2 />} />
          <Route path="/assessment/results" element={<AssessmentResults />} />
          <Route path="/guides" element={<SmartGuide />} />
          <Route path="/cheatsheet" element={<PeptideCheatSheet />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Router>
    </PricingProvider>
  );
}

export default App;
