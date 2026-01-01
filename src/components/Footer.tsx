import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  // Contact Links
  const whatsappMessage = encodeURIComponent('Hi! I would like to inquire about your products.');
  const whatsappUrl = `https://api.whatsapp.com/send?phone=639179243135&text=${whatsappMessage}`;

  return (
    <footer className="bg-theme-navy text-white border-t border-theme-blue/10 pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">

          {/* Brand Section */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-theme-blue/20">
              <img
                src="/logo.png"
                alt="biopeptides.ph"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-left">
              <div className="font-bold text-white text-xl tracking-tight">
                biopeptides.ph
              </div>
              <div className="text-sm text-theme-blue font-medium tracking-wide uppercase">Peptides & Essentials</div>

              <div className="mt-4 flex gap-6 text-sm">
                <Link to="/" className="text-gray-400 hover:text-white transition-colors">Home</Link>
                <Link to="/journey" className="text-gray-400 hover:text-white transition-colors">Our Journey</Link>
                <Link to="/guides" className="text-gray-400 hover:text-white transition-colors">Smart Guides</Link>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 justify-center md:justify-end">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-gray-300 hover:text-theme-blue transition-colors text-sm font-medium px-4 py-2 rounded-full border border-theme-blue/20 hover:border-theme-blue/50"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="border-t border-gray-800 pt-8 text-center">
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
            Made with
            <Heart className="w-3 h-3 text-theme-red fill-theme-red" />
            © {currentYear} biopeptides.ph. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
