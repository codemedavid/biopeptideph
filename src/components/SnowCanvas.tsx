import { useEffect, useRef } from 'react';

interface Petal {
  x: number;
  y: number;
  s: number;    // petal size
  d: number;    // fall speed
  sway: number;
  sw: number;
  rot: number;  // rotation
  rs: number;   // spin
  flip: number; // x-scale → tumbling look
  o: number;    // opacity
  c: string;    // color
}

const PETAL_COLORS = ['#ffd6e6', '#fbbdd6', '#f7a9c8', '#ffc2da', '#ffe3ee'];

/**
 * Sakura falling-petal background.
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
    let petals: Petal[] = [];
    let W = 0;
    let H = 0;
    let raf = 0;

    const build = () => {
      const target = Math.round((W / 26) * density);
      petals = Array.from({ length: target }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() * 5 + 5,
        d: Math.random() * 0.5 + 0.25,
        sway: Math.random() * Math.PI * 2,
        sw: Math.random() * 0.5 + 0.2,
        rot: Math.random() * Math.PI * 2,
        rs: (Math.random() - 0.5) * 0.04,
        flip: Math.random() * 0.6 + 0.7,
        o: Math.random() * 0.4 + 0.5,
        c: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
      }));
    };

    const drawPetal = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(p.flip * Math.sin(p.sway * 0.5), 1); // gentle tumble
      ctx.globalAlpha = p.o;
      ctx.fillStyle = p.c;
      // sakura petal: rounded with a small notch at the tip
      const s = p.s;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.85, -s * 0.7, s * 0.7, s * 0.55, 0, s);
      ctx.bezierCurveTo(-s * 0.7, s * 0.55, -s * 0.85, -s * 0.7, 0, -s);
      ctx.fill();
      // subtle highlight
      ctx.globalAlpha = p.o * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.2, s * 0.18, s * 0.4, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of petals) {
        drawPetal(p);
        p.y += p.d * 1.1;
        p.sway += p.sw * 0.03;
        p.x += Math.sin(p.sway) * 0.7;
        p.rot += p.rs;
        if (p.y > H + 12) {
          p.y = -12;
          p.x = Math.random() * W;
        }
        if (p.x > W + 12) p.x = -12;
        if (p.x < -12) p.x = W + 12;
      }
      ctx.globalAlpha = 1;
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
