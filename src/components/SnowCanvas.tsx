import { useEffect, useRef } from 'react';

interface Flake {
  x: number;
  y: number;
  r: number;
  d: number;
  sway: number;
  sw: number;
  o: number;
}

/**
 * Frosted-ice falling-snow background.
 * Fixed, pointer-events-none, sits behind the page chrome.
 * Respects prefers-reduced-motion (renders nothing / static).
 */
const SnowCanvas = ({ density = 0.55 }: { density?: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let flakes: Flake[] = [];
    let W = 0;
    let H = 0;
    let raf = 0;

    const build = () => {
      const target = Math.round((W / 14) * density);
      flakes = Array.from({ length: target }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 2.4 + 0.8,
        d: Math.random() * 0.6 + 0.3,
        sway: Math.random() * Math.PI * 2,
        sw: Math.random() * 0.4 + 0.1,
        o: Math.random() * 0.5 + 0.4,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const f of flakes) {
        ctx.globalAlpha = f.o;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const f of flakes) {
        f.y += f.d * 1.1;
        f.sway += f.sw * 0.04;
        f.x += Math.sin(f.sway) * 0.5;
        if (f.y > H + 5) {
          f.y = -5;
          f.x = Math.random() * W;
        }
        if (f.x > W + 5) f.x = -5;
        if (f.x < -5) f.x = W + 5;
      }
      if (density > 0 && !reduce) raf = requestAnimationFrame(draw);
    };

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      build();
    };

    const start = () => {
      if (density > 0 && !reduce) {
        build();
        draw();
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };

    window.addEventListener('resize', resize);
    resize();
    start();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [density]);

  return <canvas ref={canvasRef} className="snow-canvas" aria-hidden="true" />;
};

export default SnowCanvas;
