import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles, FlaskConical } from 'lucide-react';

import { useSiteSettings } from '../hooks/useSiteSettings';

type HeroProps = {
  onShopAll?: () => void;
};

const Hero: React.FC<HeroProps> = ({ onShopAll }) => {
  const navigate = useNavigate();
  const { siteSettings } = useSiteSettings();

  // Content Fallbacks (Clinical Futurism Theme)
  const badge = siteSettings?.home_hero_badge || 'Advanced Peptide Solutions';
  const titlePrefix = siteSettings?.home_hero_title_prefix || 'The Science';
  const titleHighlight = siteSettings?.home_hero_title_highlight || 'of Renewal';
  const titleSuffix = siteSettings?.home_hero_title_suffix || '';
  const subtext = siteSettings?.home_hero_subtext || 'Advanced peptide solutions backed by science.';
  const description = siteSettings?.home_hero_description || 'Experience the future of wellness with our research-grade peptides. Meticulously tested for purity, designed for longevity, and trusted by experts for superior results.';

  return (
    <div className="relative overflow-hidden bg-theme-navy text-white pt-10 pb-10 md:pt-20 md:pb-20 lg:pt-24 lg:pb-24">
      {/* Abstract Background Shapes (DNA/Molecular effect) */}
      <div className="absolute top-0 right-0 -mr-40 -mt-40 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-gradient-to-br from-theme-blue/20 to-theme-lightblue/5 blur-3xl opacity-40 pointer-events-none animate-pulse-slow" />
      <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[250px] md:w-[500px] h-[250px] md:h-[500px] rounded-full bg-gradient-to-tr from-theme-blue/10 to-theme-navy blur-3xl opacity-40 pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay pointer-events-none"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-theme-blue/10 border border-theme-blue/30 shadow-lg shadow-theme-blue/10 mb-6 md:mb-10 animate-fadeIn cursor-default backdrop-blur-sm">
            <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-theme-blue opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-theme-blue"></span>
            </span>
            <span className="text-[10px] md:text-sm font-semibold text-theme-lightblue tracking-widest uppercase">
              {badge}
            </span>
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-bold text-white mb-4 md:mb-10 tracking-tight leading-[1.1]">
            <span className="block">{titlePrefix}</span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-theme-lightblue via-white to-theme-blue pb-1">{titleHighlight}</span>
            {titleSuffix && <span className="block">{titleSuffix}</span>}
          </h1>

          {/* Subtext */}
          <p className="text-base sm:text-xl md:text-2xl text-theme-lightblue/90 font-light mb-4 md:mb-8 max-w-3xl mx-auto tracking-wide px-4">
            {subtext}
          </p>

          {/* Description */}
          <p className="text-sm md:text-lg text-gray-400 mb-6 md:mb-10 max-w-2xl mx-auto leading-relaxed antialiased font-light hidden sm:block">
            {description}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-10 md:mb-12">
            <button
              className="btn-primary bg-theme-blue hover:bg-theme-blue/90 text-white border-none px-10 py-4 rounded-full text-base font-semibold shadow-lg shadow-theme-blue/20 hover:shadow-theme-blue/40 transition-all duration-300 hover:-translate-y-1 flex items-center gap-2"
              onClick={onShopAll}
            >
              Explore Products
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              className="px-10 py-4 rounded-full text-base font-semibold text-white border border-theme-blue/30 hover:bg-theme-blue/10 transition-all duration-300 backdrop-blur-sm"
              onClick={() => navigate('/assessment')}
            >
              Start Assessment
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-3 gap-3 md:gap-6 max-w-5xl mx-auto border-t border-theme-blue/20 pt-8 md:pt-12 px-2 md:px-0">
            <div className="flex flex-col items-center gap-2 md:gap-4 p-2 md:p-6 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm group">
              <div className="p-2 md:p-3 bg-theme-blue/20 rounded-lg md:rounded-xl text-theme-lightblue mb-0 md:mb-1 group-hover:scale-110 transition-transform duration-300">
                <ShieldCheck className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-white text-xs md:text-lg mb-0.5 md:mb-1">Lab Verified</h3>
                <p className="text-[10px] md:text-sm text-gray-400 leading-tight">99%+ Purity</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 md:gap-4 p-2 md:p-6 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm group">
              <div className="p-2 md:p-3 bg-theme-red/20 rounded-lg md:rounded-xl text-theme-red mb-0 md:mb-1 group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-white text-xs md:text-lg mb-0.5 md:mb-1">Research Grade</h3>
                <p className="text-[10px] md:text-sm text-gray-400 leading-tight">Excellence</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 md:gap-4 p-2 md:p-6 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm group">
              <div className="p-2 md:p-3 bg-theme-blue/20 rounded-lg md:rounded-xl text-theme-lightblue mb-0 md:mb-1 group-hover:scale-110 transition-transform duration-300">
                <FlaskConical className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-white text-xs md:text-lg mb-0.5 md:mb-1">Real-World</h3>
                <p className="text-[10px] md:text-sm text-gray-400 leading-tight">Expert Verified</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Hero;

