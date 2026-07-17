import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  // Contact Links
  const whatsappMessage = encodeURIComponent('Hi! I would like to inquire about your products.');
  const whatsappUrl = `https://api.whatsapp.com/send?phone=639273823893&text=${whatsappMessage}`;

  return (
    <footer className="relative overflow-hidden glacier-surface text-white border border-[var(--frost-line)] shadow-[var(--shadow-frost)] rounded-[var(--r-lg)] mx-3 md:mx-7 mb-7 mt-14 pt-16 pb-8">
      <div className="frost-glints" />
      <div className="foot-seigaiha" aria-hidden="true" />
      <div className="container mx-auto px-4 relative z-[2]">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">

          {/* Brand Section */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] grid place-items-center flex-none overflow-hidden shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]">
              <img src="/sakura-logo.jpg" alt="Saku Fuji" className="w-full h-full object-cover" />
            </div>
            <div className="text-left">
              <div className="font-jp font-extrabold text-white text-[22px] tracking-tight">
                Saku Fuji
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
            © {currentYear} Saku Fuji. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
