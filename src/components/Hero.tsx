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

  // Content Fallbacks (Sakura Theme)
  const badge = siteSettings?.home_hero_badge || 'INSPIRED BY SAKURA • CRAFTED FOR EXCELLENCE';
  const titlePrefix = siteSettings?.home_hero_title_prefix || 'Sakura';
  const titleHighlight = siteSettings?.home_hero_title_highlight || 'Wellness';
  const titleSuffix = siteSettings?.home_hero_title_suffix || 'Collection';
  const subtext = siteSettings?.home_hero_subtext || 'Discover premium peptides and wellness essentials designed for quality, confidence, and care.';
  const heroImage = siteSettings?.home_hero_image_url || '';
  const ctaText = siteSettings?.home_hero_cta_text || '';
  const ctaLink = siteSettings?.home_hero_cta_link || '';

  // Primary CTA: an active GB always wins; otherwise an admin-set CTA; otherwise Explore Products.
  const primaryLabel = activeGbNumber ? `Explore GB #${activeGbNumber}` : (ctaText || 'Explore Collection');
  const handlePrimary = () => {
    if (!activeGbNumber && ctaLink) {
      if (/^https?:\/\//.test(ctaLink)) window.open(ctaLink, '_blank');
      else navigate(ctaLink);
      return;
    }
    onShopAll?.();
  };

  const trustPoints = [
    // TEMP_HIDDEN: trust badges removed — restore by uncommenting
    // { icon: ShieldCheck, label: 'Lab Verified' },
    // { icon: Sparkles, label: 'Research Grade' },
    // { icon: FlaskConical, label: 'Expert Verified' },
  ];

  // Frosted trust bar — sits below the hero card
  const trustBar = trustPoints.length === 0 ? null : (
    <div className="mx-3 md:mx-7 mt-[18px]">
      <div className="frost-soft rounded-[var(--r-md)] flex items-center justify-center gap-x-8 sm:gap-x-12 gap-y-2 flex-wrap p-4">
        {trustPoints.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 text-theme-text/70 font-semibold text-[15px]">
            <Icon className="w-[22px] h-[22px] text-theme-secondary flex-shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // A set background image always wins. Only when no background image is set
  // and the admin has active carousel slides does the hero become the carousel.
  if (!heroImage && activeSlides.length > 0) {
    return (
      <div className="relative overflow-hidden">
        <HeroCarousel slides={activeSlides} activeGbNumber={activeGbNumber} onShopAll={onShopAll} />
        {trustBar}
      </div>
    );
  }

  return (
    <>
      {/* HERO CARD — glacier gradient */}
      <section className="mx-3 md:mx-7 mt-6">
        <div className="relative overflow-hidden rounded-[32px] glacier-surface border border-[var(--frost-line)] shadow-[var(--shadow-frost)] grid min-h-[430px]">
          {/* Optional admin background image, tinted for legibility */}
          {heroImage && (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-40"
                style={{ backgroundImage: `url(${heroImage})` }}
              />
              <div className="absolute inset-0 bg-[#5c1f3d]/55 pointer-events-none" />
            </>
          )}
          <div className="frost-glints" />
          <div className="hero-kanji" aria-hidden="true">雪</div>

          {/* LEFT — copy + CTAs */}
          <div className="relative z-[2] flex flex-col justify-center px-8 py-12 sm:px-12 sm:py-[52px]">
            <div className="hanko" aria-hidden="true"><span>桜</span></div>
            <span className="inline-flex items-center gap-2.5 self-start px-[15px] py-2 rounded-full font-bold text-[12.5px] tracking-[0.14em] uppercase text-[#eaf7ff] bg-white/[0.12] border border-white/[0.28] backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-soft)] shadow-[0_0_12px_2px_var(--accent-soft)]" />
              {badge}
            </span>

            <h1 className="font-jp font-extrabold text-white tracking-[-0.02em] leading-[1.06] text-[clamp(40px,4.6vw,68px)] mt-[22px]">
              {titlePrefix}{' '}
              <span className="bg-gradient-to-b from-white via-[#ffd6e6] to-[#ff9ecb] bg-clip-text text-transparent">{titleHighlight}</span>
              {titleSuffix ? <> {titleSuffix}</> : null}
            </h1>

            <p className="text-[#cfe6f7] text-lg leading-[1.55] max-w-[30ch] mt-[18px]">
              {subtext}
            </p>

            <div className="flex items-center gap-3.5 mt-[30px] flex-wrap">
              <button
                onClick={handlePrimary}
                className="group inline-flex items-center gap-2.5 font-display font-semibold text-base px-[26px] py-[15px] rounded-full text-[#06283d] bg-gradient-to-b from-white to-[#ffe1ee] shadow-[0_16px_36px_-14px_rgba(247,116,168,0.7),0_0_0_1px_rgba(255,255,255,0.6)_inset] hover:-translate-y-0.5 transition-all"
              >
                {primaryLabel}
                <ArrowRight className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/assessment')}
                className="inline-flex items-center gap-2 font-semibold text-[15.5px] text-[#eaf7ff] px-[22px] py-3.5 rounded-full border border-white/[0.32] bg-white/[0.07] hover:bg-white/[0.16] transition-all"
              >
                Start Assessment
              </button>
            </div>
          </div>
        </div>
      </section>

      {trustBar}
    </>
  );
};

export default Hero;
