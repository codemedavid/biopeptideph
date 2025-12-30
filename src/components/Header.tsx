import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Menu, X, MessageCircle, Globe } from 'lucide-react';
import { usePricingMode } from '../hooks/usePricingMode';
import type { PricingMode } from '../types';

interface HeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
  onMenuClick: () => void;
  onPricingModeChange?: (mode: PricingMode, hasCartItems: boolean) => boolean; // Returns true if should proceed
}

const Header: React.FC<HeaderProps> = ({ cartItemsCount, onCartClick, onMenuClick, onPricingModeChange }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pricingMode, setPricingMode, currencySymbol } = usePricingMode();

  // Contact Links
  const whatsappMessage = encodeURIComponent('Hi! I am interested in your products.');
  const whatsappUrl = `https://api.whatsapp.com/send?phone=639179243135&text=${whatsappMessage}`;

  const handlePricingModeClick = (newMode: PricingMode) => {
    if (newMode === pricingMode) return;

    // If there are items in cart, ask for confirmation
    if (cartItemsCount > 0) {
      if (onPricingModeChange) {
        const shouldProceed = onPricingModeChange(newMode, true);
        if (shouldProceed) {
          setPricingMode(newMode);
        }
      } else {
        // Default confirmation
        const confirmed = window.confirm(
          'Changing currency will update prices in your cart. Continue?'
        );
        if (confirmed) {
          setPricingMode(newMode);
        }
      }
    } else {
      setPricingMode(newMode);
    }
  };

  // Currency Toggle Component
  const CurrencyToggle = ({ className = '' }: { className?: string }) => (
    <div className={`flex items-center gap-1 bg-white/10 rounded-full p-0.5 ${className}`}>
      <button
        onClick={() => handlePricingModeClick('national')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${pricingMode === 'national'
          ? 'bg-theme-blue text-white shadow-md'
          : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        title="Philippine Peso (PHP)"
      >
        <span className="text-sm">🇵🇭</span>
        <span>PHP</span>
      </button>
      <button
        onClick={() => handlePricingModeClick('international')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${pricingMode === 'international'
          ? 'bg-theme-blue text-white shadow-md'
          : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        title="US Dollar (USD)"
      >
        <span className="text-sm">🌎</span>
        <span>USD</span>
      </button>
    </div>
  );

  return (
    <>
      <header className="bg-theme-navy sticky top-0 z-50 border-b border-theme-blue/20 shadow-lg backdrop-blur-sm bg-theme-navy/95">
        <div className="container mx-auto px-3 md:px-6 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Logo - Rectangular to show full logo */}
            <button
              onClick={() => { onMenuClick(); setMobileMenuOpen(false); }}
              className="flex items-center hover:opacity-90 transition-all flex-shrink-0"
            >
              <div className="h-10 sm:h-12 md:h-14">
                <img
                  src="/logo.png"
                  alt="PEPTOLOGY.PH"
                  className="h-full w-auto object-contain"
                />
              </div>
            </button>

            {/* Right Side - Currency Toggle, Cart, Menu */}
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4">
              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-5">
                <Link to="/" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Home</Link>
                <button
                  onClick={() => onMenuClick()}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
                >
                  Shop
                </button>
                <Link to="/journey" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Our Journey</Link>
                <Link to="/guides" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Guides</Link>
                <Link to="/assessment" className="text-sm font-medium text-theme-blue bg-white/10 px-3 py-1.5 rounded-full hover:bg-white/20 transition-all border border-transparent hover:border-theme-blue/30 backdrop-blur-sm">
                  Start Assessment
                </Link>
                <div className="h-4 w-px bg-white/20"></div>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm font-medium"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              </nav>

              {/* Currency Toggle - Always visible, compact on mobile */}
              <CurrencyToggle className="flex-shrink-0" />

              {/* Cart Button */}
              <button
                onClick={onCartClick}
                className="relative p-1.5 sm:p-2 text-white hover:text-theme-blue transition-colors flex-shrink-0"
              >
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-theme-blue text-white text-[9px] sm:text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-theme-navy">
                    {cartItemsCount}
                  </span>
                )}
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-1.5 sm:p-2 text-white hover:text-theme-blue transition-colors flex-shrink-0"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute top-[56px] sm:top-[60px] right-0 left-0 bg-theme-navy shadow-xl animate-slideIn border-b border-theme-blue/20"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="px-4 py-6">
              <div className="flex flex-col space-y-4">
                <button
                  onClick={() => {
                    onMenuClick();
                    setMobileMenuOpen(false);
                  }}
                  className="text-left text-white font-medium text-base hover:text-theme-blue transition-colors border-l-2 border-transparent hover:border-theme-blue pl-4 py-1"
                >
                  Shop
                </button>
                <Link
                  to="/journey"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-white font-medium text-base hover:text-theme-blue transition-colors border-l-2 border-transparent hover:border-theme-blue pl-4 py-1"
                >
                  Our Journey
                </Link>
                <Link
                  to="/guides"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-white font-medium text-base hover:text-theme-blue transition-colors border-l-2 border-transparent hover:border-theme-blue pl-4 py-1"
                >
                  Smart Guides
                </Link>
                <div className="pt-4 border-t border-gray-800 flex flex-col gap-3">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-gray-300 hover:text-theme-blue transition-colors pl-4"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </a>
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
