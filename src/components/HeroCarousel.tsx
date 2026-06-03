import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import type { HeroSlide } from '../types';

interface HeroCarouselProps {
  slides: HeroSlide[];
  activeGbNumber?: number | null;
  onShopAll?: () => void;
}

const AUTOPLAY_MS = 5500;
const SWIPE_THRESHOLD = 50; // px

const HeroCarousel: React.FC<HeroCarouselProps> = ({ slides, activeGbNumber, onShopAll }) => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  // Defensive: only render slides that actually have an image.
  const visible = slides.filter((s) => !!s.image_url);
  const count = visible.length;

  // Derive a safe, in-range index so a shrinking list can never show a blank slide.
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;

  const goTo = useCallback((i: number) => { if (count > 0) setIndex(((i % count) + count) % count); }, [count]);
  const next = useCallback(() => { if (count > 0) setIndex((c) => (c + 1) % count); }, [count]);
  const prev = useCallback(() => { if (count > 0) setIndex((c) => (c - 1 + count) % count); }, [count]);

  // Autoplay — uses a functional update so it always reads the current count;
  // resets whenever the visible slide changes; pauses on hover/touch; only >1 slide.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setTimeout(() => setIndex((c) => (c + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [safeIndex, paused, count]);

  const handleCta = (slide: HeroSlide) => {
    if (slide.button_text && slide.button_link) {
      if (/^https?:\/\//.test(slide.button_link)) window.open(slide.button_link, '_blank');
      else navigate(slide.button_link);
      return;
    }
    onShopAll?.();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current !== null) touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    try {
      if (Math.abs(touchDeltaX.current) > SWIPE_THRESHOLD) {
        if (touchDeltaX.current < 0) next();
        else prev();
      }
    } finally {
      touchStartX.current = null;
      touchDeltaX.current = 0;
      setPaused(false);
    }
  };

  if (count === 0) return null;

  return (
    <section
      className="relative w-full h-[56vh] min-h-[380px] sm:h-[64vh] md:h-[70vh] max-h-[820px] overflow-hidden bg-theme-blue"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      aria-roledescription="carousel"
      aria-label="Hero highlights"
    >
      {visible.map((slide, i) => {
        const isCurrent = i === safeIndex;
        const label = slide.button_text || (activeGbNumber ? `Explore GB #${activeGbNumber}` : 'Explore Products');
        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${isCurrent ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
            aria-hidden={!isCurrent}
          >
            {/* Image — object-cover prevents distortion; fixed container prevents layout shift */}
            <img
              src={slide.image_url}
              alt={slide.title || 'Hero slide'}
              className="absolute inset-0 w-full h-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
            />
            {/* Scrim for text legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/30" />

            {/* Optional per-slide content (title/subtitle optional; CTA always shown) */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
                <div className="max-w-2xl">
                  {slide.title && (
                    <h2 className="font-display text-3xl sm:text-5xl md:text-6xl font-semibold text-white leading-tight drop-shadow-md animate-fadeIn">
                      {slide.title}
                    </h2>
                  )}
                  {slide.subtitle && (
                    <p className="mt-3 text-base sm:text-lg md:text-xl text-white/90 font-light drop-shadow animate-fadeIn">
                      {slide.subtitle}
                    </p>
                  )}
                  <button
                    onClick={() => handleCta(slide)}
                    className="group mt-6 inline-flex items-center gap-2 bg-theme-navy hover:bg-theme-navy/90 text-white px-8 py-3.5 rounded-full text-base font-semibold shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    {label}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
          </div>
        );
      })}

      {/* Arrows */}
      {count > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-20 p-2 md:p-3 rounded-full bg-white/25 hover:bg-white/40 backdrop-blur text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-20 p-2 md:p-3 rounded-full bg-white/25 hover:bg-white/40 backdrop-blur text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </>
      )}

      {/* Dots */}
      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {visible.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === safeIndex}
              className={`h-2 rounded-full transition-all ${i === safeIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default HeroCarousel;
