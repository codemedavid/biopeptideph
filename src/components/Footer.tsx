import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  // Contact Links
  const whatsappMessage = encodeURIComponent('Hi! I would like to inquire about your products.');
  const whatsappUrl = `https://api.whatsapp.com/send?phone=639273823885&text=${whatsappMessage}`;

  return (
    <footer className="relative overflow-hidden glacier-surface text-white border border-[var(--frost-line)] shadow-[var(--shadow-frost)] rounded-[var(--r-lg)] mx-3 md:mx-7 mb-7 mt-14 pt-16 pb-8">
      <div className="frost-glints" />
      <div className="foot-seigaiha" aria-hidden="true" />
      <div className="container mx-auto px-4 relative z-[2]">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">

          {/* Brand Section */}
          <div className="flex items-center gap-4">
            <div className="brand-badge w-12 h-12 rounded-[14px] grid place-items-center flex-none">
              <svg className="w-6 h-6 relative z-[1] drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" viewBox="0 0 24 24" fill="none">
                <path d="M5 3h14l3 5-10 13L2 8z" fill="url(#dgf)" />
                <path d="M5 3l4 5h6l4-5" stroke="#fff" strokeOpacity=".5" strokeWidth=".7" />
                <path d="M2 8h20" stroke="#fff" strokeOpacity=".4" strokeWidth=".7" />
                <path d="M9 8l3 13 3-13" stroke="#fff" strokeOpacity=".5" strokeWidth=".7" />
                <defs>
                  <linearGradient id="dgf" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#ffe1ee" />
                    <stop offset=".5" stopColor="#fbbdd6" />
                    <stop offset="1" stopColor="#f774a8" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="text-left">
              <div className="font-jp font-extrabold text-white text-[22px] tracking-tight">
                Snow Snow
              </div>
              <div className="text-sm text-[var(--accent-soft)] font-semibold tracking-[0.18em] uppercase mt-1">A Cooler Kind of Glow · <span className="font-jp tracking-[0.08em] normal-case">さくら</span></div>

              <div className="mt-4 flex gap-6 text-sm">
                <Link to="/" className="text-[#bcdcef] hover:text-white transition-colors">Home</Link>
                <Link to="/journey" className="text-[#bcdcef] hover:text-white transition-colors">Our Journey</Link>
                <Link to="/guides" className="text-[#bcdcef] hover:text-white transition-colors">Smart Guides</Link>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 justify-center md:justify-end">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#bcdcef] hover:text-white transition-colors text-sm font-medium px-4 py-2 rounded-full border border-white/20 hover:border-white/40"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="border-t border-white/[0.14] pt-8 text-center">
          <p className="text-xs text-[#9cc1da] flex items-center justify-center gap-1">
            Made with
            <Heart className="w-3 h-3 text-theme-red fill-theme-red" />
            © {currentYear} Snow Snow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
