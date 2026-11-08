import type { RGB } from './utils';

const cache = new Map<string, HTMLCanvasElement>();

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Soft glowing spark sprite: hot white core → colour → transparent halo. */
export function glowSprite(c: RGB, core = 0.18): HTMLCanvasElement {
  const key = `g${c.join(',')}|${core}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 64;
  const [cv, g] = makeCanvas(size);
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,250,1)');
  grd.addColorStop(core * 0.6, `rgba(${Math.min(255, c[0] + 40)},${Math.min(255, c[1] + 60)},${Math.min(255, c[2] + 60)},0.95)`);
  grd.addColorStop(core, `rgba(${c[0]},${c[1]},${c[2]},0.75)`);
  grd.addColorStop(0.45, `rgba(${c[0]},${c[1]},${c[2]},0.18)`);
  grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  cache.set(key, cv);
  return cv;
}

export interface SpriteSet {
  hot: HTMLCanvasElement;
  main: HTMLCanvasElement;
  cool: HTMLCanvasElement;
}

/** Hot (just ignited) → main colour → cooling ember, so sparks change temperature as they burn out. */
export function spriteSet(c: RGB): SpriteSet {
  const cool: RGB = [Math.round(c[0] * 0.95), Math.round(c[1] * 0.5), Math.round(c[2] * 0.25)];
  return {
    hot: glowSprite([255, 236, 200], 0.24),
    main: glowSprite(c),
    cool: glowSprite(cool, 0.14),
  };
}

function cached(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  cache.set(key, c);
  return c;
}

/** Gold coin face: rim, inner ring and a highlight. It is squashed horizontally at draw time to spin. */
export function coinSprite(): HTMLCanvasElement {
  return cached('coin', 64, 64, (g) => {
    const grd = g.createRadialGradient(24, 22, 2, 32, 32, 30);
    grd.addColorStop(0, '#fff6c8');
    grd.addColorStop(0.35, '#ffd25a');
    grd.addColorStop(0.8, '#d98a12');
    grd.addColorStop(1, '#8a4a06');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,60,0,0.6)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(32, 32, 21, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,240,190,0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(32, 32, 19, Math.PI * 1.1, Math.PI * 1.8);
    g.stroke();
  });
}

/** Clay diya bowl, seen from the front. */
export function diyaSprite(): HTMLCanvasElement {
  return cached('diya', 96, 48, (g) => {
    g.beginPath();
    g.moveTo(4, 14);
    g.quadraticCurveTo(48, 6, 92, 14);
    g.quadraticCurveTo(86, 44, 48, 46);
    g.quadraticCurveTo(10, 44, 4, 14);
    g.closePath();
    const grd = g.createLinearGradient(0, 8, 0, 46);
    grd.addColorStop(0, '#d0641c');
    grd.addColorStop(0.35, '#8c3510');
    grd.addColorStop(1, '#2a0d04');
    g.fillStyle = grd;
    g.fill();
    // lit rim
    g.strokeStyle = 'rgba(255,190,90,0.85)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(6, 14);
    g.quadraticCurveTo(48, 6, 90, 14);
    g.stroke();
    // painted dots
    g.fillStyle = 'rgba(255,215,120,0.75)';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(20 + i * 9.3, 26 + Math.sin((i / 6) * Math.PI) * 4, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Teardrop flame with a white-hot core. */
export function flameSprite(): HTMLCanvasElement {
  return cached('flame', 32, 64, (g) => {
    g.beginPath();
    g.moveTo(16, 2);
    g.bezierCurveTo(22, 20, 30, 34, 26, 48);
    g.quadraticCurveTo(16, 64, 6, 48);
    g.bezierCurveTo(2, 34, 10, 20, 16, 2);
    const grd = g.createRadialGradient(16, 46, 1, 16, 40, 30);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(0.3, 'rgba(255,225,120,1)');
    grd.addColorStop(0.65, 'rgba(255,140,30,0.95)');
    grd.addColorStop(1, 'rgba(255,80,0,0.2)');
    g.fillStyle = grd;
    g.fill();
  });
}

/** Paper sky lantern glowing from the flame inside. */
export function lanternSprite(): HTMLCanvasElement {
  return cached('lantern', 48, 64, (g) => {
    g.beginPath();
    g.moveTo(10, 6);
    g.lineTo(38, 6);
    g.quadraticCurveTo(44, 34, 36, 58);
    g.lineTo(12, 58);
    g.quadraticCurveTo(4, 34, 10, 6);
    g.closePath();
    const grd = g.createLinearGradient(0, 6, 0, 58);
    grd.addColorStop(0, 'rgba(200,70,20,0.85)');
    grd.addColorStop(0.6, 'rgba(255,150,50,0.95)');
    grd.addColorStop(1, 'rgba(255,230,150,1)');
    g.fillStyle = grd;
    g.fill();
    g.fillStyle = 'rgba(255,250,220,0.95)';
    g.beginPath();
    g.ellipse(24, 56, 7, 3, 0, 0, Math.PI * 2);
    g.fill();
  });
}

/** Soft glowing heart. */
export function heartSprite(c: [number, number, number]): HTMLCanvasElement {
  return cached(`heart${c.join(',')}`, 64, 64, (g) => {
    const path = (s: number) => {
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        if (i === 0) g.moveTo(32 + x * s, 30 + y * s);
        else g.lineTo(32 + x * s, 30 + y * s);
      }
      g.closePath();
    };
    g.shadowColor = `rgba(${c[0]},${c[1]},${c[2]},0.9)`;
    g.shadowBlur = 12;
    path(1.45);
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.55)`;
    g.fill();
    g.shadowBlur = 0;
    path(0.9);
    g.fillStyle = 'rgba(255,235,240,0.75)';
    g.fill();
  });
}

/** Warm grey smoke puff, lit from below by the fire. */
export function smokeSprite(): HTMLCanvasElement {
  const key = 'smoke';
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 128;
  const [cv, g] = makeCanvas(size);
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(150,128,115,0.55)');
  grd.addColorStop(0.5, 'rgba(110,95,90,0.25)');
  grd.addColorStop(1, 'rgba(80,70,70,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  cache.set(key, cv);
  return cv;
}
