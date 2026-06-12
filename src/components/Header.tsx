import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Menu, X, MessageCircle } from 'lucide-react';
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
  const whatsappUrl = `https://api.whatsapp.com/send?phone=639273823885&text=${whatsappMessage}`;

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

  // Currency Toggle Component — frosted pill
  const CurrencyToggle = ({ className = '' }: { className?: string }) => (
    <div className={`flex items-center gap-1 bg-white/50 border border-[var(--frost-line)] rounded-full p-0.5 ${className}`}>
      <button
        onClick={() => handlePricingModeClick('national')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${pricingMode === 'national'
          ? 'bg-gradient-to-b from-theme-blue to-theme-secondary text-white shadow-md'
          : 'text-theme-text/70 hover:text-theme-text hover:bg-white/60'
          }`}
        title="Philippine Peso (PHP)"
      >
        <span className="text-sm">🇵🇭</span>
        <span>PHP</span>
      </button>
      <button
        onClick={() => handlePricingModeClick('international')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${pricingMode === 'international'
          ? 'bg-gradient-to-b from-theme-blue to-theme-secondary text-white shadow-md'
          : 'text-theme-text/70 hover:text-theme-text hover:bg-white/60'
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
      <header className="sticky top-0 z-50">
        <div className="frost-panel rounded-[var(--r-lg)] mx-3 md:mx-7 mt-3.5 px-3 md:px-[18px] py-3">
          <div className="flex items-center gap-3 md:gap-[22px]">
            {/* Brand — diamond badge + name */}
            <button
              onClick={() => { onMenuClick(); setMobileMenuOpen(false); }}
              className="flex items-center gap-3.5 hover:opacity-90 transition-all flex-shrink-0 text-left min-w-0"
            >
              <div className="brand-badge w-[46px] h-[46px] sm:w-[54px] sm:h-[54px] rounded-[15px] flex-none grid place-items-center">
                <svg className="w-6 h-6 relative z-[1] drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" viewBox="0 0 24 24" fill="none">
                  <path d="M5 3h14l3 5-10 13L2 8z" fill="url(#dg)" />
                  <path d="M5 3l4 5h6l4-5" stroke="#fff" strokeOpacity=".5" strokeWidth=".7" />
                  <path d="M2 8h20" stroke="#fff" strokeOpacity=".4" strokeWidth=".7" />
                  <path d="M9 8l3 13 3-13" stroke="#fff" strokeOpacity=".5" strokeWidth=".7" />
                  <defs>
                    <linearGradient id="dg" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#bfe6ff" />
                      <stop offset=".5" stopColor="#7dd3fc" />
                      <stop offset="1" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="font-display font-extrabold text-[20px] sm:text-[22px] leading-none tracking-[-0.02em] text-theme-text whitespace-nowrap">Snow Snow</div>
                <div className="text-[10.5px] tracking-[0.22em] text-theme-text/60 uppercase mt-1.5 font-semibold whitespace-nowrap">A Cooler Kind of Glow</div>
              </div>
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1.5 ml-2">
              <Link to="/" className="px-3.5 py-2 rounded-[11px] font-semibold text-[15px] text-theme-text/65 hover:text-theme-text hover:bg-white/50 transition">Home</Link>
              <button
                onClick={() => onMenuClick()}
                className="px-3.5 py-2 rounded-[11px] font-semibold text-[15px] text-theme-text/65 hover:text-theme-text hover:bg-white/50 transition bg-transparent border-none cursor-pointer"
              >
                Shop
              </button>
              <Link to="/journey" className="px-3.5 py-2 rounded-[11px] font-semibold text-[15px] text-theme-text/65 hover:text-theme-text hover:bg-white/50 transition">Our Journey</Link>
              <Link to="/guides" className="px-3.5 py-2 rounded-[11px] font-semibold text-[15px] text-theme-text/65 hover:text-theme-text hover:bg-white/50 transition">Guides</Link>
            </nav>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Start Assessment — frosted pill */}
            <Link
              to="/assessment"
              className="hidden md:inline-flex font-display font-semibold text-[14.5px] px-5 py-2.5 rounded-full text-theme-text bg-[var(--frost-strong)] border border-[var(--frost-line)] shadow-[0_6px_16px_-10px_rgba(20,70,120,0.5)] hover:shadow-[var(--glow)] hover:-translate-y-px transition-all"
            >
              Start Assessment
            </Link>

            {/* Right Side - Util pills, Cart, Menu */}
            <div className="flex items-center gap-2 md:gap-3.5">
              <div className="hidden xl:block w-px h-[26px] bg-[var(--frost-edge)]" />

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 border border-[var(--frost-line)] text-[13.5px] font-semibold text-theme-text/70 hover:text-theme-text transition"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>

              {/* Currency Toggle */}
              <CurrencyToggle className="hidden sm:flex flex-shrink-0" />

              {/* Cart Button — ice gradient */}
              <button
                onClick={onCartClick}
                className="relative w-[42px] h-[42px] rounded-[13px] grid place-items-center bg-gradient-to-b from-theme-blue to-theme-secondary text-white shadow-[0_10px_22px_-10px_var(--ice-deep)] hover:-translate-y-px transition-all flex-shrink-0"
                aria-label="Cart"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-theme-accent text-[#06283d] text-[11px] font-extrabold grid place-items-center border-2 border-white">
                    {cartItemsCount}
                  </span>
                )}
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden w-[42px] h-[42px] rounded-[13px] grid place-items-center bg-white/50 border border-[var(--frost-line)] text-theme-text hover:bg-white/70 transition flex-shrink-0"
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
        <div className="lg:hidden fixed inset-0 z-40 bg-[#0c2c4a]/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute top-[78px] right-3 left-3 frost-panel rounded-[var(--r-md)] shadow-xl animate-slideIn"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="px-4 py-6">
              <div className="flex flex-col space-y-4">
                <button
                  onClick={() => {
                    onMenuClick();
                    setMobileMenuOpen(false);
                  }}
                  className="text-left text-theme-text font-semibold text-base hover:text-theme-secondary transition-colors border-l-2 border-transparent hover:border-theme-accent pl-4 py-1"
                >
                  Shop
                </button>
                <Link
                  to="/journey"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-theme-text font-semibold text-base hover:text-theme-secondary transition-colors border-l-2 border-transparent hover:border-theme-accent pl-4 py-1"
                >
                  Our Journey
                </Link>
                <Link
                  to="/guides"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-theme-text font-semibold text-base hover:text-theme-secondary transition-colors border-l-2 border-transparent hover:border-theme-accent pl-4 py-1"
                >
                  Smart Guides
                </Link>
                <Link
                  to="/assessment"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-theme-text font-semibold text-base hover:text-theme-secondary transition-colors border-l-2 border-transparent hover:border-theme-accent pl-4 py-1"
                >
                  Start Assessment
                </Link>
                <div className="pt-4 border-t border-[var(--frost-edge)] flex flex-col gap-3">
                  {/* Currency Toggle for small screens */}
                  <div className="sm:hidden pl-4 pb-2">
                    <p className="text-xs text-theme-text/60 mb-2 font-medium uppercase tracking-wider">Currency</p>
                    <CurrencyToggle />
                  </div>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-theme-text/75 hover:text-theme-secondary transition-colors pl-4"
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
