export type RGB = [number, number, number];

export const COLORS = {
  orange: [255, 106, 0] as RGB, // primary orange #FF6A00
  amber: [255, 142, 28] as RGB,
  gold: [255, 186, 66] as RGB,
  pale: [255, 218, 150] as RGB,
  white: [255, 242, 220] as RGB,
  ember: [255, 70, 12] as RGB,
};

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Random point on a unit sphere projected to 2D — gives the natural "shell" density of a real firework burst. */
export function sphereDir(): [number, number] {
  const u = rand(-1, 1);
  const th = rand(0, Math.PI * 2);
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(th), r * Math.sin(th)];
}

/** Deterministic RNG so the skyline stays the same on resize. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weighted<T>(items: readonly { v: T; w: number }[]): T {
  let total = 0;
  for (const it of items) total += it.w;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return items[items.length - 1].v;
}
