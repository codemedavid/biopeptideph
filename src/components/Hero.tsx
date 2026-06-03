import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles, FlaskConical } from 'lucide-react';

import { useSiteSettings } from '../hooks/useSiteSettings';
import { useHeroCarousel } from '../hooks/useHeroCarousel';
import HeroCarousel from './HeroCarousel';

type HeroProps = {
  onShopAll?: () => void;
  activeGbNumber?: number | null;
};

const Hero: React.FC<HeroProps> = ({ onShopAll, activeGbNumber }) => {
  const navigate = useNavigate();
  const { siteSettings } = useSiteSettings();
  const { activeSlides } = useHeroCarousel();

  // Content Fallbacks (Clinical Futurism Theme)
  const badge = siteSettings?.home_hero_badge || 'Luminous Beauty Essentials';
  const titlePrefix = siteSettings?.home_hero_title_prefix || 'Diamond';
  const titleHighlight = siteSettings?.home_hero_title_highlight || 'Glow';
  const titleSuffix = siteSettings?.home_hero_title_suffix || '';
  const subtext = siteSettings?.home_hero_subtext || 'Radiance, refined for your everyday ritual.';
  const heroImage = siteSettings?.home_hero_image_url || '';
  const ctaText = siteSettings?.home_hero_cta_text || '';
  const ctaLink = siteSettings?.home_hero_cta_link || '';

  // Primary CTA: an active GB always wins; otherwise an admin-set CTA; otherwise Explore Products.
  const primaryLabel = activeGbNumber ? `Explore GB #${activeGbNumber}` : (ctaText || 'Explore Products');
  const handlePrimary = () => {
    if (!activeGbNumber && ctaLink) {
      if (/^https?:\/\//.test(ctaLink)) window.open(ctaLink, '_blank');
      else navigate(ctaLink);
      return;
    }
    onShopAll?.();
  };

  const trustPoints = [
    { icon: ShieldCheck, label: 'Lab Verified' },
    { icon: Sparkles, label: 'Research Grade' },
    { icon: FlaskConical, label: 'Expert Verified' },
  ];

  const trustStrip = (
    <div className="relative z-10 border-t border-white/20">
      <div className="container mx-auto px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 sm:gap-x-12 gap-y-2 py-5">
          {trustPoints.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-white/75">
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium tracking-wide">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // When the admin has active carousel slides, the hero IS the carousel.
  // Otherwise fall back to the existing static hero below (graceful default).
  if (activeSlides.length > 0) {
    return (
      <div className="relative overflow-hidden bg-theme-blue text-white">
        <HeroCarousel slides={activeSlides} activeGbNumber={activeGbNumber} onShopAll={onShopAll} />
        {trustStrip}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-theme-blue text-white">
      {/* Admin-managed background image with a brand tint for text legibility */}
      {heroImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center pointer-events-none"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-theme-blue/70 pointer-events-none" />
        </>
      )}
      {/* Depth — a single soft white bloom from the top for an airy, clean feel */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[700px] md:w-[1100px] h-[700px] md:h-[1100px] rounded-full bg-white/15 blur-[130px] pointer-events-none" />

      {/* Generous, balanced vertical rhythm */}
      <div className="container mx-auto px-6 relative z-10 py-24 sm:py-32 md:py-40">
        <div className="max-w-2xl mx-auto text-center flex flex-col items-center">

          {/* Badge — quiet, lowercase tracking */}
          <div className="inline-flex items-center gap-2.5 mb-10 animate-fadeIn cursor-default">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
            </span>
            <span className="text-[11px] md:text-xs font-medium text-white/80 tracking-[0.25em] uppercase">
              {badge}
            </span>
          </div>

          {/* Main Heading — the single focal point */}
          <h1 className="font-display text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-medium text-white mb-8 leading-[0.92] animate-fadeIn">
            <span className="block">{titlePrefix}</span>
            <span className="block italic text-theme-navy">
              {titleHighlight}
            </span>
            {titleSuffix && <span className="block">{titleSuffix}</span>}
          </h1>

          {/* One elegant line of copy */}
          <p className="text-lg md:text-xl text-white/85 font-light mb-12 max-w-md mx-auto leading-relaxed">
            {subtext}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <button
              className="group btn-primary w-full sm:w-auto bg-theme-navy hover:bg-theme-navy/90 text-white border-none px-10 py-4 rounded-full text-base font-semibold shadow-lg shadow-theme-navy/20 hover:shadow-theme-navy/40 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
              onClick={handlePrimary}
            >
              {primaryLabel}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              className="w-full sm:w-auto px-10 py-4 rounded-full text-base font-semibold text-white border border-white/60 hover:bg-white hover:text-theme-navy transition-all duration-300"
              onClick={() => navigate('/assessment')}
            >
              Start Assessment
            </button>
          </div>

        </div>
      </div>

      {/* Understated trust strip — anchored to the very bottom */}
      {trustStrip}
    </div>
  );
};

export default Hero;
