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
  const badge = siteSettings?.home_hero_badge || 'Now Open · Research Grade';
  const subtext = siteSettings?.home_hero_subtext || 'Lab-verified research peptides, frozen at purity and shipped cold. Built for researchers who don’t compromise.';
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

  // Frosted trust bar — sits below the hero card
  const trustBar = (
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

  // When the admin has active carousel slides, the hero IS the carousel.
  // Otherwise fall back to the designed frosted-ice hero below.
  if (activeSlides.length > 0) {
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
        <div className="relative overflow-hidden rounded-[32px] glacier-surface border border-[var(--frost-line)] shadow-[var(--shadow-frost)] grid lg:grid-cols-[1.15fr_0.85fr] min-h-[430px]">
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

          {/* LEFT — copy + CTAs */}
          <div className="relative z-[2] flex flex-col justify-center px-8 py-12 sm:px-12 sm:py-[52px]">
            <span className="inline-flex items-center gap-2.5 self-start px-[15px] py-2 rounded-full font-bold text-[12.5px] tracking-[0.14em] uppercase text-[#eaf7ff] bg-white/[0.12] border border-white/[0.28] backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-soft)] shadow-[0_0_12px_2px_var(--accent-soft)]" />
              {badge}
            </span>

            <h1 className="font-display font-extrabold text-white tracking-[-0.03em] leading-[1.02] text-[clamp(40px,4.6vw,68px)] mt-[22px]">
              A cooler kind<br />of{' '}
              <span className="bg-gradient-to-b from-white via-[#ffd6e6] to-[#ff9ecb] bg-clip-text text-transparent">glow.</span>
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

          {/* RIGHT — Group Buy Live promo card */}
          <div className="relative z-[2] grid place-items-center px-8 pb-10 lg:pb-9 lg:pl-2 lg:pr-11 lg:pt-9">
            <div className="w-full max-w-[330px] rounded-[24px] p-[26px] bg-white/[0.14] border border-white/[0.28] backdrop-blur-[14px] shadow-[0_24px_50px_-22px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.4)_inset] text-[#eaf7ff]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-[7px] font-display font-bold text-xs tracking-[0.1em] px-3 py-1.5 rounded-full text-white bg-gradient-to-b from-[#ff5470] to-[#e11d48] shadow-[0_6px_16px_-8px_rgba(225,29,72,0.9)]">
                  <span className="live-dot" />LIVE NOW
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#bcdcef] font-semibold">
                  <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  1.2k watching
                </span>
              </div>

              <h3 className="font-display font-bold text-[23px] tracking-[-0.02em] text-white mt-4 mb-0.5">Group Buy is open</h3>
              <div className="text-[13.5px] text-[#bcdcef]">Hosted live now · join the live to shop the drops</div>

              {/* Live tile */}
              <div className="relative mt-[18px] h-[148px] rounded-[16px] overflow-hidden grid place-items-center border border-white/[0.18]" style={{ background: 'radial-gradient(120% 120% at 50% 20%,#8d3a5f,#3a132a 75%)' }}>
                <div className="frost-glints" />
                <span className="absolute top-[11px] left-[11px] inline-flex items-center gap-1.5 font-display font-bold text-[10.5px] tracking-[0.08em] px-[9px] py-[5px] rounded-lg text-white bg-[rgba(225,29,72,0.92)]">
                  <span className="live-dot" />LIVE
                </span>
                <button
                  onClick={handlePrimary}
                  aria-label="Watch the live"
                  className="w-[54px] h-[54px] rounded-full grid place-items-center text-[#06283d] bg-white/[0.92] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)] hover:scale-105 transition-transform"
                >
                  <svg className="w-[22px] h-[22px] ml-[3px]" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <span className="absolute bottom-2.5 left-[11px] text-[11.5px] font-semibold text-[#dceefb] px-[9px] py-1 rounded-md bg-[rgba(8,28,46,0.55)] backdrop-blur-sm">Snow Snow Official</span>
              </div>

              <button
                onClick={handlePrimary}
                className="mt-4 w-full flex items-center justify-center gap-2.5 font-display font-bold text-[15px] py-[13px] rounded-[13px] text-[#06283d] bg-gradient-to-b from-white to-[#ffe1ee] shadow-[0_14px_30px_-12px_rgba(247,116,168,0.8),0_0_0_1px_rgba(255,255,255,0.6)_inset] hover:-translate-y-0.5 transition-all"
              >
                Join the Live
                <ArrowRight className="w-[17px] h-[17px]" />
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
