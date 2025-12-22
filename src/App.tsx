import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import { PricingProvider } from './hooks/usePricingMode';
import Header from './components/Header';
import Hero from './components/Hero';
import CTASection from './components/CTASection';
import SubNav from './components/SubNav';
import MobileNav from './components/MobileNav';
import Menu from './components/Menu';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import FloatingCartButton from './components/FloatingCartButton';
import Footer from './components/Footer';
import AdminDashboard from './components/AdminDashboard';
import { useMenu } from './hooks/useMenu';
import PeptideJourney from './pages/PeptideJourney';
import AssessmentWizardV2 from './pages/AssessmentWizardV2';
import AssessmentResults from './pages/AssessmentResults';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import SmartGuide from './pages/SmartGuide';
import type { PricingMode } from './types';

function MainApp() {
  const cart = useCart();
  const { menuItems } = useMenu();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout'>('menu');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    setCurrentView(view);
    // Scroll to top when changing views
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
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

  // Filter products based on selected category
  const filteredProducts = selectedCategory === 'all'
    ? menuItems
    : menuItems.filter(item => item.category === selectedCategory);

  return (
    <div className="min-h-screen bg-white font-inter flex flex-col">
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
              onShopAll={() => {
                document.getElementById('product-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
            <Menu
              menuItems={filteredProducts}
              addToCart={cart.addToCart}
              cartItems={cart.cartItems}
              updateQuantity={cart.updateQuantity}
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
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/journey" element={<PeptideJourney />} />
          <Route path="/assessment" element={<AssessmentWizardV2 />} />
          <Route path="/assessment/results" element={<AssessmentResults />} />
          <Route path="/guides" element={<SmartGuide />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Router>
    </PricingProvider>
  );
}

export default App;
