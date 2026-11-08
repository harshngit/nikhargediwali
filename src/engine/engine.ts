import type { AudioEngine } from './audio';
import { spriteSet, glowSprite, smokeSprite, coinSprite, diyaSprite, flameSprite, lanternSprite, heartSprite, type SpriteSet } from './sprites';
import { sampleText } from './text';
import { COLORS, rand, randInt, pick, clamp, easeInOutCubic, sphereDir, mulberry32, type RGB } from './utils';

export type ShellType = 'peony' | 'chrysanthemum' | 'willow' | 'ring' | 'palm' | 'strobe' | 'crackle' | 'heart';

/** Festival atmosphere. Every value eases in and out, so switching festivals is a smooth cross-fade. */
export interface Scene {
  /** colour of the glow on the horizon */
  tint: RGB;
  tintA: number;
  /** 0–1: how many diyas burn along the ground */
  diyas: number;
  /** sky lanterns released per second */
  lanterns: number;
  /** glowing hearts released per second */
  hearts: number;
  /** golden coins drifting down per second */
  coins: number;
}

interface Coin { x: number; y: number; vx: number; vy: number; rot: number; spin: number; size: number; age: number; life: number; drag: number; grav: number }
interface Floater { kind: 'lantern' | 'heart'; x: number; y: number; vx: number; vy: number; size: number; age: number; life: number; ph: number; c: HTMLCanvasElement }
interface Diya { x: number; y: number; s: number; ph: number; sp: number; on: number }

export interface LaunchOpts {
  x?: number;
  tx: number;
  ty: number;
  type: ShellType;
  main: RGB;
  alt?: RGB;
  scale?: number;
  /** 0 = close and bright, 1 = far away, dim and quiet */
  depth?: number;
  flight?: number;
  whistle?: boolean;
  big?: boolean;
  /** golden coins showered out of the burst */
  coins?: number;
  onExplode?: (x: number, y: number) => void;
}

interface Spark {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; size: number; alpha: number;
  spr: SpriteSet;
  drag: number; grav: number;
  strobe: number; phase: number;
  glitter: number; gAcc: number;
  twinkle: boolean; crackle: boolean; fadePow: number;
}

interface Rocket {
  x: number; y: number; vx: number; vy: number; g: number;
  age: number; flight: number; opts: LaunchOpts; emit: number; smokeAcc: number;
}

interface Smoke { x: number; y: number; vx: number; vy: number; r: number; gr: number; age: number; life: number; a: number }
interface Flash { x: number; y: number; r: number; age: number; life: number; a: number; c: RGB }

interface TP {
  x: number; y: number; vx: number; vy: number;
  tx: number; ty: number; sx: number; sy: number;
  hx: number; hy: number; hx2: number; hy2: number;
  ph: number; formAt: number; formDur: number; curve: number;
  seed: number; spd: number; spr: SpriteSet; size: number; pop: number;
}

export interface FormLayout { cx: number; cy: number; boxW: number; boxH: number }

export interface FormOpts {
  id: string;
  text: string;
  family: string;
  weight: number;
  spacing: number;
  count: number;
  layout: (w: number, h: number) => FormLayout;
  palette: { c: RGB; w: number }[];
  /** explosion centre(s), or id of another formation whose sparks drip down to form this one */
  origin: { x: number; y: number } | { x: number; y: number }[] | string;
  burst: number;
  formAt: [number, number];
  formDur: [number, number];
  glow: number;
}

interface Formation {
  opts: FormOpts;
  parts: TP[];
  age: number;
  glow: HTMLCanvasElement;
  gx: number; gy: number;
  box: { cx: number; cy: number; width: number; height: number };
  step: number;
  formed: number;
}

interface Star { x: number; y: number; r: number; a: number; sp: number; ph: number }
interface Dust { x: number; y: number; vx: number; vy: number; r: number; a: number; ph: number }
interface Bulb { x: number; y: number; c: HTMLCanvasElement; ph: number; sp: number; r: number }

export class FireworksEngine {
  readonly bg: HTMLCanvasElement;
  readonly fx: HTMLCanvasElement;
  readonly top: HTMLCanvasElement;
  private bgc: CanvasRenderingContext2D;
  private fxc: CanvasRenderingContext2D;
  private topc: CanvasRenderingContext2D;

  w = 0; h = 0; dpr = 1; S = 1;
  quality = 1;
  /** device tier, fixed at start — used for text density so the logo never looks sparse */
  baseQuality = 1;
  time = 0;
  audio: AudioEngine | null = null;
  onTick: ((dt: number, t: number) => void) | null = null;
  onResize: (() => void) | null = null;

  private sparks: Spark[] = [];
  private rockets: Rocket[] = [];
  private smoke: Smoke[] = [];
  private flashes: Flash[] = [];
  private forms = new Map<string, Formation>();
  private stars: Star[] = [];
  private dust: Dust[] = [];
  private bulbs: Bulb[] = [];
  private sky: HTMLCanvasElement = document.createElement('canvas');
  private skyline: HTMLCanvasElement = document.createElement('canvas');
  private raf = 0;
  private last = 0;
  private slowFrames = 0;
  private fastFrames = 0;
  private resizeTimer = 0;
  private flashLevel = 0;
  private destroyed = false;
  private readonly smokeImg = smokeSprite();
  private readonly glitterSpr = spriteSet(COLORS.pale);
  private readonly emberSpr = spriteSet(COLORS.ember);
  private readonly rocketHead = glowSprite([255, 225, 170], 0.3);
  private readonly coinImg = coinSprite();
  private readonly coinGlint = glowSprite([255, 240, 190], 0.25);
  private readonly diyaImg = diyaSprite();
  private readonly flameImg = flameSprite();
  private readonly flameGlow = glowSprite([255, 150, 40], 0.12);
  private readonly lanternImg = lanternSprite();
  private readonly lanternGlow = glowSprite([255, 140, 40], 0.1);
  private readonly heartImgs = [heartSprite([255, 105, 170]), heartSprite([255, 160, 200]), heartSprite([255, 150, 80])];

  private coins: Coin[] = [];
  private floaters: Floater[] = [];
  private diyaSpots: Diya[] = [];
  private target: Scene = { tint: [255, 110, 30], tintA: 0.6, diyas: 0, lanterns: 0, hearts: 0, coins: 0 };
  private tint: RGB = [255, 110, 30];
  private tintA = 0.6;
  private diyaLevel = 0;
  private spawnAcc = { lanterns: 0, hearts: 0, coins: 0 };

  constructor(private host: HTMLElement) {
    const mk = (z: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const c = document.createElement('canvas');
      c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;z-index:${z};pointer-events:none;`;
      host.appendChild(c);
      return [c, c.getContext('2d', { alpha: z !== 0 })!];
    };
    [this.bg, this.bgc] = mk(0);
    [this.fx, this.fxc] = mk(1);
    [this.top, this.topc] = mk(2);
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    const cores = navigator.hardwareConcurrency || 4;
    this.quality = this.baseQuality = mobile ? 0.6 : cores <= 4 ? 0.8 : 1;
    this.resize();
    window.addEventListener('resize', this.handleResize);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    this.bg.remove();
    this.fx.remove();
    this.top.remove();
  }

  private handleResize = (): void => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.resize(), 120);
  };

  private resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    const mobile = Math.min(w, h) < 600;
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
    this.w = w;
    this.h = h;
    this.S = Math.min(w, h) / 900;
    for (const c of [this.bg, this.fx, this.top]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    for (const c of [this.bgc, this.fxc, this.topc]) c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.buildSky();
    this.buildSkyline();
    this.buildStars();
    this.buildDiyas();
    for (const f of this.forms.values()) this.retarget(f);
    this.onResize?.();
  }

  // ───────────────────────────── scenery ─────────────────────────────

  private buildSky(): void {
    const { w, h } = this;
    const c = this.sky;
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    const g = c.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#010208');
    grd.addColorStop(0.45, '#050819');
    grd.addColorStop(0.8, '#0b0d22');
    grd.addColorStop(1, '#1a0f14');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // warm city glow on the horizon
    const rg = g.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, Math.max(w, h) * 0.75);
    rg.addColorStop(0, 'rgba(255,110,30,0.16)');
    rg.addColorStop(0.4, 'rgba(160,60,30,0.06)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    // faint haze band
    const hz = g.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.3, h * 0.25, w * 0.6);
    hz.addColorStop(0, 'rgba(60,70,130,0.06)');
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
  }

  private buildStars(): void {
    const { w, h } = this;
    const n = Math.min(320, Math.round((w * h) / 4500));
    this.stars = [];
    for (let i = 0; i < n; i++) {
      const y = Math.pow(Math.random(), 1.4) * h * 0.85;
      this.stars.push({ x: Math.random() * w, y, r: Math.random() < 0.08 ? rand(1, 1.6) : rand(0.3, 0.9), a: rand(0.25, 0.9) * (1 - y / h), sp: rand(0.5, 2.5), ph: rand(0, 6.28) });
    }
    if (!this.dust.length) {
      for (let i = 0; i < 46; i++) this.dust.push(this.newDust(true));
    }
  }

  private newDust(anywhere: boolean): Dust {
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 10,
      vx: rand(-6, 6),
      vy: -rand(5, 18),
      r: rand(1, 2.6),
      a: rand(0.08, 0.3),
      ph: rand(0, 6.28),
    };
  }

  private buildSkyline(): void {
    const { w, h } = this;
    const c = this.skyline;
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    const g = c.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const r = mulberry32(2026);
    const R = (a: number, b: number) => a + r() * (b - a);
    const portrait = h > w;
    const maxH = h * (portrait ? 0.1 : 0.13);
    const scaleW = clamp(w / 1400, 0.55, 1.2);
    const roofs: { x: number; y: number; w: number }[] = [];
    this.bulbs = [];
    let x = -10;
    g.fillStyle = '#03040a';
    while (x < w + 10) {
      const bw = R(34, 96) * scaleW;
      const bh = R(0.3, 1) * maxH;
      const type = r();
      const top = h - bh;
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x, top);
      if (type < 0.14) {
        // temple shikhara
        g.lineTo(x + bw * 0.2, top);
        g.quadraticCurveTo(x + bw * 0.5, top - bh * 0.9, x + bw * 0.8, top);
        g.lineTo(x + bw, top);
      } else if (type < 0.26) {
        // dome
        g.lineTo(x + bw * 0.15, top);
        g.arc(x + bw / 2, top, bw * 0.35, Math.PI, 0);
        g.lineTo(x + bw, top);
      } else if (type < 0.36) {
        // antenna tower
        g.lineTo(x + bw * 0.47, top);
        g.lineTo(x + bw * 0.5, top - bh * 0.5);
        g.lineTo(x + bw * 0.53, top);
        g.lineTo(x + bw, top);
      } else {
        g.lineTo(x + bw, top);
      }
      g.lineTo(x + bw, h);
      g.closePath();
      g.fill();
      roofs.push({ x, y: top, w: bw });
      // lit windows
      g.save();
      for (let wy = top + 6; wy < h - 4; wy += R(7, 10)) {
        for (let wx = x + 5; wx < x + bw - 5; wx += R(7, 11)) {
          if (r() < 0.16) {
            g.fillStyle = r() < 0.7 ? 'rgba(255,170,80,0.55)' : 'rgba(255,220,160,0.4)';
            g.fillRect(wx, wy, 2.2, 3);
          }
        }
      }
      g.restore();
      g.fillStyle = '#03040a';
      x += bw + R(-4, 6);
    }
    // ground strip
    g.fillRect(0, h - 3, w, 3);

    // Diwali string lights (toran) between rooftops + diyas on parapets
    const bulbColors = [glowSprite(COLORS.gold), glowSprite(COLORS.orange), glowSprite(COLORS.white), glowSprite(COLORS.amber)];
    for (let i = 0; i < roofs.length - 1; i++) {
      const a = roofs[i];
      const b = roofs[i + 1];
      if (r() < 0.55) {
        const x1 = a.x + a.w * 0.6, y1 = a.y;
        const x2 = b.x + b.w * 0.4, y2 = b.y;
        const sag = R(8, 22) * scaleW;
        const n = Math.max(4, Math.round(Math.abs(x2 - x1) / (9 * scaleW)));
        for (let k = 1; k < n; k++) {
          const t = k / n;
          this.bulbs.push({
            x: x1 + (x2 - x1) * t,
            y: y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * sag,
            c: bulbColors[k % bulbColors.length],
            ph: R(0, 6.28),
            sp: R(1, 3),
            r: 3.2 * scaleW + 1.2,
          });
        }
      }
      if (r() < 0.5) {
        const n = Math.max(1, Math.round(a.w / 22));
        for (let k = 0; k < n; k++)
          this.bulbs.push({ x: a.x + (a.w * (k + 0.5)) / n, y: a.y - 2, c: bulbColors[1], ph: R(0, 6.28), sp: R(5, 9), r: 4 * scaleW + 1.5 });
      }
    }
  }

  /** A row of diyas on the ground in front of the city. They light up one by one. */
  private buildDiyas(): void {
    const { w, h } = this;
    const s = clamp(Math.min(w, h) / 900, 0.5, 1.1);
    const gap = 64 * s + 18;
    const n = Math.min(26, Math.max(5, Math.floor(w / gap)));
    const r = mulberry32(7);
    this.diyaSpots = [];
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * w + (r() - 0.5) * gap * 0.3;
      this.diyaSpots.push({ x, y: h - 4 * s, s: s * (0.85 + r() * 0.3), ph: r() * 6.28, sp: 7 + r() * 6, on: 0 });
    }
  }

  setScene(s: Scene): void {
    this.target = s;
  }

  // ───────────────────────────── spawning ─────────────────────────────

  private spark(p: Partial<Spark> & { x: number; y: number; vx: number; vy: number; spr: SpriteSet }): Spark {
    const s: Spark = {
      age: 0, life: 1.5, size: 6 * this.S + 2, alpha: 0.85,
      drag: 2.4, grav: 150 * this.S, strobe: 0, phase: Math.random() * 6.28,
      glitter: 0, gAcc: 0, twinkle: false, crackle: false, fadePow: 1.4,
      ...p,
    };
    this.sparks.push(s);
    return s;
  }

  private puff(x: number, y: number, r: number, a: number): void {
    if (this.smoke.length > 260 * this.quality) return;
    this.smoke.push({ x, y, vx: rand(-8, 8) * this.S, vy: rand(-10, 2) * this.S, r, gr: rand(14, 30) * this.S, age: 0, life: rand(4, 8), a });
  }

  launch(o: LaunchOpts): void {
    const x0 = o.x ?? o.tx + rand(-40, 40) * this.S;
    const y0 = this.h + 8;
    const flight = o.flight ?? rand(1.25, 1.75);
    const H = y0 - o.ty;
    this.rockets.push({
      x: x0, y: y0, vx: (o.tx - x0) / flight, vy: (-2 * H) / flight, g: (2 * H) / (flight * flight),
      age: 0, flight, opts: o, emit: 0, smokeAcc: 0,
    });
    this.audio?.launch(flight, (x0 / this.w) * 2 - 1, o.depth ?? 0, o.whistle ?? Math.random() < 0.6);
  }

  explode(x: number, y: number, o: LaunchOpts): void {
    const depth = o.depth ?? 0;
    const scale = (o.scale ?? 1) * (1 - depth * 0.5);
    const S = this.S;
    const q = this.quality;
    const dim = 1 - depth * 0.55;
    const V = 430 * S * Math.sqrt(scale);
    const main = spriteSet(o.main);
    const alt = spriteSet(o.alt ?? o.main);
    const size = (6.5 * S + 2) * (1 - depth * 0.35) * (o.big ? 1.25 : 1);
    const n = (base: number) => Math.max(12, Math.round(base * scale * q));

    this.flashes.push({ x, y, r: 330 * S * scale, age: 0, life: o.big ? 0.6 : 0.38, a: (o.big ? 0.55 : 0.32) * dim, c: o.main });
    const pan = (x / this.w) * 2 - 1;
    this.audio?.explode(scale * (o.big ? 1.5 : 1), pan, depth, 0.05 + depth * 0.3 + rand(0, 0.08));
    for (let i = 0, m = Math.round((7 + 7 * scale) * q); i < m; i++) {
      const [dx, dy] = sphereDir();
      this.puff(x + dx * 120 * S * scale, y + dy * 120 * S * scale, rand(30, 60) * S * scale, rand(0.06, 0.13) * dim);
    }

    const burst = (count: number, speed: number, spr: SpriteSet, extra: Partial<Spark> = {}) => {
      for (let i = 0; i < count; i++) {
        const [dx, dy] = sphereDir();
        const sp = speed * rand(0.9, 1.05);
        this.spark({ x, y, vx: dx * sp, vy: dy * sp, spr, size, alpha: 0.85 * dim, life: rand(1.1, 1.7), ...extra });
      }
    };

    switch (o.type) {
      case 'peony': {
        burst(n(130), V, main);
        burst(n(30), V * 0.4, alt, { life: rand(0.8, 1.1) });
        break;
      }
      case 'chrysanthemum': {
        burst(n(110), V, main, { glitter: 22, life: rand(1.4, 1.9) });
        burst(n(28), V * 0.38, alt, { life: 1 });
        this.audio?.crackle(1.0 + depth * 0.3, 1.0, 40, pan, depth);
        break;
      }
      case 'willow': {
        const gold = spriteSet(COLORS.gold);
        burst(n(95), V * 0.8, gold, { drag: 3.3, grav: 105 * S, glitter: 14, fadePow: 0.7, size: size * 0.85 });
        for (const s of this.sparks.slice(-n(95))) s.life = rand(3, 4.3);
        this.audio?.crackle(1.2 + depth * 0.3, 1.8, 26, pan, depth);
        break;
      }
      case 'ring': {
        const m = n(80);
        const tilt = rand(0.3, 0.95);
        const rot = rand(0, Math.PI);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2;
          const dx = Math.cos(a), dy = Math.sin(a) * tilt;
          const vx = (dx * cr - dy * sr) * V * 0.85;
          const vy = (dx * sr + dy * cr) * V * 0.85;
          this.spark({ x, y, vx, vy, spr: main, size, alpha: 0.9 * dim, life: rand(1.3, 1.6) });
        }
        burst(n(40), V * 0.35, alt, { life: 1.1 });
        break;
      }
      case 'palm': {
        const arms = randInt(7, 10);
        const off = rand(0, 6.28);
        for (let i = 0; i < arms; i++) {
          const a = off + (i / arms) * Math.PI * 2;
          const sp = V * rand(0.8, 0.95);
          this.spark({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - V * 0.15, spr: main, size: size * 1.9, alpha: dim, life: 1.9, drag: 1.7, grav: 190 * S, glitter: 70, fadePow: 1 });
        }
        burst(n(40), V * 0.3, alt, { life: 0.9 });
        break;
      }
      case 'strobe': {
        burst(n(95), V * 0.85, spriteSet(COLORS.white), { strobe: rand(7, 12), life: rand(1.8, 2.4), drag: 2.7, fadePow: 0.9 });
        this.audio?.crackle(0.5 + depth * 0.3, 1.6, 22, pan, depth);
        break;
      }
      case 'crackle': {
        burst(n(70), V * 0.9, main, { crackle: true, life: rand(0.8, 1.05) });
        this.audio?.crackle(0.85 + depth * 0.3, 0.7, 120, pan, depth);
        break;
      }
      case 'heart': {
        // every spark gets the same drag and gravity, so the heart keeps its shape as it expands and falls
        const m = n(120);
        const rot = rand(-0.2, 0.2);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        const k = (V * 0.8) / 17;
        for (let i = 0; i < m; i++) {
          const t = (i / m) * Math.PI * 2;
          const hx = 16 * Math.pow(Math.sin(t), 3);
          const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          this.spark({ x, y, vx: (hx * cr - hy * sr) * k, vy: (hx * sr + hy * cr) * k, spr: main, size, alpha: 0.95 * dim, life: 1.7, drag: 2.2, grav: 70 * S, fadePow: 1.6 });
        }
        burst(n(36), V * 0.3, alt, { life: 1.2, glitter: 6 });
        break;
      }
    }
    if (o.coins) {
      const m = Math.round(o.coins * Math.max(0.6, q));
      for (let i = 0; i < m; i++) {
        const [dx, dy] = sphereDir();
        const sp = V * rand(0.45, 1);
        this.coins.push({
          x, y, vx: dx * sp, vy: dy * sp - 50 * S, rot: rand(0, 6.28), spin: rand(5, 11) * (Math.random() < 0.5 ? -1 : 1),
          size: rand(6, 9) * S + 3, age: 0, life: rand(2.8, 3.8), drag: 1.6, grav: 200 * S,
        });
      }
      this.audio?.coins(0.15 + depth * 0.2, pan);
    }
    o.onExplode?.(x, y);
  }

  private emitGlitter(s: Spark): void {
    this.spark({
      x: s.x + rand(-1, 1), y: s.y + rand(-1, 1),
      vx: s.vx * 0.08 + rand(-12, 12) * this.S, vy: s.vy * 0.08 + rand(-6, 12) * this.S,
      spr: this.glitterSpr, size: s.size * 0.45, alpha: s.alpha * 0.8 * (1 - s.age / s.life),
      life: rand(0.35, 0.8), drag: 3, grav: 200 * this.S, twinkle: true, fadePow: 1,
    });
  }

  // ───────────────────────────── text formation ─────────────────────────────

  formText(o: FormOpts): void {
    const L = o.layout(this.w, this.h);
    const sm = sampleText(o.text, o.family, o.weight, L.boxW, L.boxH, Math.round(o.count * Math.max(0.6, this.baseQuality)), o.spacing);
    const parts: TP[] = [];
    const src = typeof o.origin === 'string' ? this.forms.get(o.origin) : undefined;
    const origins = typeof o.origin === 'string' ? null : Array.isArray(o.origin) ? o.origin : [o.origin];
    const pts = sm.points.sort(() => Math.random() - 0.5);
    for (const p of pts) {
      const tx = L.cx + p.x;
      const ty = L.cy + p.y;
      let x: number, y: number, vx: number, vy: number;
      if (src && src.parts.length) {
        const sp = pick(src.parts);
        x = sp.tx; y = sp.ty;
        vx = rand(-30, 30) * this.S; vy = rand(-10, 60) * this.S;
      } else {
        const org = origins?.length ? pick(origins) : { x: L.cx, y: L.cy };
        x = org.x; y = org.y;
        const dx = tx - x, dy = ty - y;
        const len = Math.hypot(dx, dy) || 1;
        const [rx, ry] = sphereDir();
        const sp = o.burst * this.S * rand(0.75, 1.1);
        vx = (dx / len) * 0.75 * sp + rx * 0.5 * sp;
        vy = (dy / len) * 0.75 * sp + ry * 0.5 * sp;
      }
      const c = this.pickColor(o.palette, p.v);
      parts.push({
        x, y, vx, vy, tx, ty, sx: x, sy: y, hx: x, hy: y, hx2: x, hy2: y,
        ph: 0, formAt: rand(o.formAt[0], o.formAt[1]), formDur: rand(o.formDur[0], o.formDur[1]),
        curve: rand(-0.22, 0.22), seed: Math.random() * 100, spd: rand(2.5, 6),
        spr: spriteSet(c), size: Math.max(2.6, sm.step * 1.75), pop: 0,
      });
    }
    this.forms.set(o.id, {
      opts: o, parts, age: 0, glow: sm.glow,
      gx: L.cx + sm.glowOffsetX, gy: L.cy + sm.glowOffsetY,
      box: { cx: L.cx, cy: L.cy, width: sm.width, height: sm.height },
      step: sm.step, formed: 0,
    });
  }

  private pickColor(palette: { c: RGB; w: number }[], v: number): RGB {
    // golden highlights along the top edge of the letters
    if (v < 0.22 && Math.random() < 0.55) return COLORS.gold;
    let t = 0;
    for (const p of palette) t += p.w;
    let r = Math.random() * t;
    for (const p of palette) {
      r -= p.w;
      if (r <= 0) return p.c;
    }
    return palette[0].c;
  }

  private retarget(f: Formation): void {
    const o = f.opts;
    const L = o.layout(this.w, this.h);
    const sm = sampleText(o.text, o.family, o.weight, L.boxW, L.boxH, f.parts.length, o.spacing);
    if (!sm.points.length) return;
    sm.points.sort(() => Math.random() - 0.5);
    f.parts.forEach((p, i) => {
      const t = sm.points[i % sm.points.length];
      p.tx = L.cx + t.x;
      p.ty = L.cy + t.y;
      p.size = Math.max(2.6, sm.step * 1.75);
      if (p.ph === 1) { p.sx = p.x; p.sy = p.y; }
    });
    f.glow = sm.glow;
    f.gx = L.cx + sm.glowOffsetX;
    f.gy = L.cy + sm.glowOffsetY;
    f.box = { cx: L.cx, cy: L.cy, width: sm.width, height: sm.height };
    f.step = sm.step;
  }

  formed(id: string): number {
    return this.forms.get(id)?.formed ?? 0;
  }

  box(id: string): { cx: number; cy: number; width: number; height: number } | null {
    return this.forms.get(id)?.box ?? null;
  }

  /** Burst formed text back into loose, falling sparks — used for transitions. */
  dissolve(): void {
    const S = this.S;
    const keep = 0.25 + 0.5 * this.quality;
    for (const f of this.forms.values()) {
      for (const p of f.parts) {
        if (Math.random() > keep) continue;
        const [dx, dy] = sphereDir();
        const sp = rand(30, 240) * S;
        this.spark({
          x: p.x, y: p.y, vx: dx * sp, vy: dy * sp - 25 * S, spr: p.spr, size: p.size * 1.1, alpha: 0.9,
          life: rand(0.8, 1.9), drag: 2, grav: 70 * S, glitter: Math.random() < 0.08 ? 8 : 0, fadePow: 1.2,
        });
      }
    }
    this.forms.clear();
  }

  // ───────────────────────────── loop ─────────────────────────────

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.adapt(dt);
    this.time += dt;
    this.onTick?.(dt, this.time);
    this.update(dt);
    this.draw(dt);
  };

  /** Keep 60 FPS: shed particles on slow devices, restore when there is headroom. */
  private adapt(dt: number): void {
    if (dt > 0.03) { this.slowFrames++; this.fastFrames = 0; } else { this.fastFrames++; this.slowFrames = Math.max(0, this.slowFrames - 1); }
    if (this.slowFrames > 45) { this.quality = Math.max(0.5, this.quality * 0.88); this.slowFrames = 0; }
    if (this.fastFrames > 600 && this.quality < 1) { this.quality = Math.min(1, this.quality * 1.08); this.fastFrames = 0; }
  }

  private update(dt: number): void {
    const S = this.S;
    const wind = 6 * S;

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dt;
      r.vy += r.g * dt;
      r.x += r.vx * dt + Math.sin(r.age * 9) * 0.25 * S;
      r.y += r.vy * dt;
      const big = r.opts.big;
      const depth = r.opts.depth ?? 0;
      r.emit += dt * (big ? 160 : 90) * this.quality * (1 - depth * 0.5);
      while (r.emit >= 1) {
        r.emit--;
        this.spark({
          x: r.x + rand(-1.5, 1.5) * S, y: r.y + rand(0, 4) * S,
          vx: rand(-25, 25) * S, vy: rand(20, 90) * S,
          spr: big ? this.glitterSpr : this.emberSpr, size: (big ? 5 : 3.6) * S + 1.4,
          alpha: 0.75 * (1 - depth * 0.6), life: rand(0.25, big ? 0.9 : 0.55), drag: 3, grav: 220 * S, twinkle: true, fadePow: 1.2,
        });
      }
      r.smokeAcc += dt * 14 * this.quality;
      while (r.smokeAcc >= 1) {
        r.smokeAcc--;
        this.puff(r.x, r.y + 6 * S, rand(6, 12) * S, rand(0.05, 0.1) * (1 - depth * 0.6));
      }
      if (r.age >= r.flight) {
        this.rockets.splice(i, 1);
        this.explode(r.x, r.y, r.opts);
      }
    }

    const sp = this.sparks;
    for (let i = sp.length - 1; i >= 0; i--) {
      const s = sp[i];
      s.age += dt;
      if (s.age >= s.life) {
        if (s.crackle) {
          for (let k = 0; k < 3; k++)
            this.spark({ x: s.x, y: s.y, vx: rand(-60, 60) * S, vy: rand(-60, 60) * S, spr: this.glitterSpr, size: s.size * 0.6, alpha: 1, life: rand(0.12, 0.28), drag: 4, grav: 100 * S, fadePow: 1 });
        }
        sp[i] = sp[sp.length - 1];
        sp.pop();
        continue;
      }
      const d = Math.exp(-s.drag * dt);
      s.vx = s.vx * d + wind * dt;
      s.vy = s.vy * d + s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.glitter > 0) {
        s.gAcc += s.glitter * dt * this.quality;
        while (s.gAcc >= 1) { s.gAcc--; this.emitGlitter(s); }
      }
    }

    for (const f of this.forms.values()) this.updateForm(f, dt);

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const m = this.smoke[i];
      m.age += dt;
      if (m.age >= m.life) { this.smoke.splice(i, 1); continue; }
      m.x += (m.vx + wind * 2) * dt;
      m.y += m.vy * dt;
      m.vy -= 1.5 * S * dt;
      m.r += m.gr * dt;
    }

    this.flashLevel = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      if (f.age >= f.life) { this.flashes.splice(i, 1); continue; }
      this.flashLevel += f.a * (1 - f.age / f.life);
    }

    for (const d of this.dust) {
      d.x += (d.vx + Math.sin(this.time * 0.5 + d.ph) * 4) * dt;
      d.y += d.vy * dt;
      if (d.y < -10 || d.x < -10 || d.x > this.w + 10) Object.assign(d, this.newDust(false));
    }

    this.updateScene(dt);
  }

  private updateScene(dt: number): void {
    const S = this.S;
    const T = this.target;
    const k = 1 - Math.exp(-dt * 1.2);
    for (let i = 0; i < 3; i++) this.tint[i] += (T.tint[i] - this.tint[i]) * k;
    this.tintA += (T.tintA - this.tintA) * k;
    this.diyaLevel += (T.diyas - this.diyaLevel) * k;
    // light / blow out diyas from the centre outwards
    const n = this.diyaSpots.length;
    this.diyaSpots.forEach((d, i) => {
      const order = Math.abs(i - (n - 1) / 2) / Math.max(1, n / 2);
      const want = order < this.diyaLevel * 1.05 ? 1 : 0;
      d.on += (want - d.on) * (1 - Math.exp(-dt * 3));
    });

    const W = this.w, H = this.h;
    const acc = this.spawnAcc;
    acc.lanterns += T.lanterns * dt;
    while (acc.lanterns >= 1) {
      acc.lanterns--;
      if (this.floaters.length > 40) break;
      const size = rand(9, 17) * S + 4;
      this.floaters.push({ kind: 'lantern', x: rand(0.05, 0.95) * W, y: H + 30, vx: rand(-6, 10) * S, vy: -rand(16, 30) * S * (size / 18), size, age: 0, life: rand(16, 26), ph: rand(0, 6.28), c: this.lanternImg });
    }
    acc.hearts += T.hearts * dt;
    while (acc.hearts >= 1) {
      acc.hearts--;
      if (this.floaters.length > 40) break;
      const size = rand(10, 20) * S + 4;
      this.floaters.push({ kind: 'heart', x: rand(0.05, 0.95) * W, y: H * rand(0.75, 1.0), vx: rand(-5, 5) * S, vy: -rand(14, 26) * S, size, age: 0, life: rand(7, 11), ph: rand(0, 6.28), c: pick(this.heartImgs) });
    }
    acc.coins += T.coins * dt;
    while (acc.coins >= 1) {
      acc.coins--;
      this.coins.push({ x: rand(0.05, 0.95) * W, y: -20, vx: rand(-8, 8) * S, vy: rand(30, 60) * S, rot: rand(0, 6.28), spin: rand(2, 5), size: rand(6, 10) * S + 3, age: 0, life: 12, drag: 0.6, grav: 12 * S });
    }
    // drop accumulated spawns when a scene turns them off
    if (!T.lanterns) acc.lanterns = 0;
    if (!T.hearts) acc.hearts = 0;
    if (!T.coins) acc.coins = 0;

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.age += dt;
      f.x += (f.vx + Math.sin(f.age * 0.8 + f.ph) * 8 * S) * dt;
      f.y += f.vy * dt;
      if (f.age > f.life || f.y < -60) this.floaters.splice(i, 1);
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      if (c.age > c.life || c.y > H + 30) { this.coins.splice(i, 1); continue; }
      const d = Math.exp(-c.drag * dt);
      c.vx *= d;
      c.vy = c.vy * d + c.grav * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
    }
  }

  private updateForm(f: Formation, dt: number): void {
    f.age += dt;
    const S = this.S;
    let formed = 0;
    const t = f.age;
    const glitterRate = 0.22 * this.quality;
    for (const p of f.parts) {
      p.hx2 = p.hx; p.hy2 = p.hy; p.hx = p.x; p.hy = p.y;
      if (p.ph === 0) {
        const d = Math.exp(-2.6 * dt);
        p.vx *= d;
        p.vy = p.vy * d + 40 * S * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (t >= p.formAt) { p.ph = 1; p.sx = p.x; p.sy = p.y; }
      } else if (p.ph === 1) {
        const k = clamp((t - p.formAt) / p.formDur, 0, 1);
        const e = easeInOutCubic(k);
        const dx = p.tx - p.sx, dy = p.ty - p.sy;
        const off = Math.sin(k * Math.PI) * p.curve;
        p.x = p.sx + dx * e - dy * off;
        p.y = p.sy + dy * e + dx * off;
        if (k >= 1) { p.ph = 2; p.pop = 1; }
      } else {
        formed++;
        p.x = p.tx + Math.sin(t * 2.1 + p.seed) * 0.5 * S;
        p.y = p.ty + Math.cos(t * 1.7 + p.seed * 1.3) * 0.5 * S;
        p.pop *= Math.exp(-6 * dt);
        if (Math.random() < 0.0035) p.pop = 1;
        if (Math.random() < glitterRate * dt) {
          const rising = Math.random() < 0.35;
          this.spark({
            x: p.x, y: p.y, vx: rand(-8, 8) * S, vy: rising ? -rand(10, 30) * S : rand(0, 15) * S,
            spr: rising ? this.emberSpr : this.glitterSpr, size: p.size * 0.7, alpha: 0.7,
            life: rand(0.7, 1.5), drag: 2.4, grav: rising ? -30 * S : 80 * S, twinkle: true, fadePow: 1.1,
          });
        }
      }
    }
    f.formed = f.parts.length ? formed / f.parts.length : 0;
  }

  // ───────────────────────────── render ─────────────────────────────

  private draw(dt: number): void {
    const { w, h } = this;
    const t = this.time;

    // background: sky, stars, dust, flashes, smoke
    const b = this.bgc;
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.drawImage(this.sky, 0, 0, w, h);
    if (this.tintA > 0.01) {
      const [r, g, bl] = this.tint.map(Math.round);
      const R = Math.max(w, h) * 0.85;
      const tg = b.createRadialGradient(w / 2, h * 1.08, 0, w / 2, h * 1.08, R);
      tg.addColorStop(0, `rgba(${r},${g},${bl},${0.2 * this.tintA})`);
      tg.addColorStop(0.45, `rgba(${r},${g},${bl},${0.06 * this.tintA})`);
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = tg;
      b.fillRect(0, 0, w, h);
    }
    b.fillStyle = '#fff';
    const starDim = 1 - Math.min(0.7, this.flashLevel);
    for (const s of this.stars) {
      b.globalAlpha = s.a * starDim * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
      b.fillRect(s.x, s.y, s.r, s.r);
    }
    b.globalCompositeOperation = 'lighter';
    const dustSpr = this.emberSpr.main;
    for (const d of this.dust) {
      b.globalAlpha = d.a * (0.6 + 0.4 * Math.sin(t * 1.3 + d.ph));
      const r = d.r * 3;
      b.drawImage(dustSpr, d.x - r, d.y - r, r * 2, r * 2);
    }
    // distant sky lanterns and hearts drift behind the fireworks
    for (const f of this.floaters) {
      const fade = Math.min(1, f.age / 1.5) * Math.min(1, (f.life - f.age) / 2) * clamp(f.y / (h * 0.25), 0, 1);
      if (fade <= 0.01) continue;
      const flick = 0.8 + 0.2 * Math.sin(t * 9 + f.ph) * Math.sin(t * 5.3 + f.ph);
      const s = f.size;
      if (f.kind === 'lantern') {
        b.globalAlpha = 0.5 * fade * flick;
        b.drawImage(this.lanternGlow, f.x - s * 2.6, f.y - s * 2.4, s * 5.2, s * 5.2);
        b.globalAlpha = 0.9 * fade;
        b.drawImage(f.c, f.x - s * 0.6, f.y - s * 0.8, s * 1.2, s * 1.6);
      } else {
        b.globalAlpha = 0.75 * fade * flick;
        const sw = Math.sin(f.age * 1.3 + f.ph) * 0.15;
        b.save();
        b.translate(f.x, f.y);
        b.rotate(sw);
        b.drawImage(f.c, -s, -s, s * 2, s * 2);
        b.restore();
      }
    }
    for (const f of this.flashes) {
      const k = f.age / f.life;
      const a = f.a * Math.pow(1 - k, 2);
      const g = b.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.8 + k * 0.6));
      g.addColorStop(0, `rgba(${f.c[0]},${Math.min(255, f.c[1] + 60)},${Math.min(255, f.c[2] + 60)},${a})`);
      g.addColorStop(0.35, `rgba(${f.c[0]},${f.c[1]},${f.c[2]},${a * 0.35})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      b.globalAlpha = 1;
      b.fillStyle = g;
      b.fillRect(f.x - f.r * 1.4, f.y - f.r * 1.4, f.r * 2.8, f.r * 2.8);
    }
    b.globalCompositeOperation = 'source-over';
    const lit = 1 + Math.min(2, this.flashLevel * 3);
    for (const m of this.smoke) {
      const k = m.age / m.life;
      b.globalAlpha = Math.min(1, m.a * lit * Math.sin(Math.min(1, k * 6) * Math.PI * 0.5) * (1 - k));
      b.drawImage(this.smokeImg, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    }

    // fireworks with persistent trails
    const c = this.fxc;
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 1;
    c.fillStyle = `rgba(0,0,0,${1 - Math.pow(1 - 0.22, dt * 60)})`;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) {
      const k = s.age / s.life;
      let a = s.alpha * Math.pow(1 - k, s.fadePow);
      if (s.strobe) a *= Math.sin(s.age * s.strobe * 6.283 + s.phase) > 0.35 ? 1.3 : 0;
      if (s.twinkle) a *= 0.35 + Math.random() * 0.65;
      if (a < 0.01) continue;
      const spr = s.strobe ? s.spr.hot : k < 0.1 ? s.spr.hot : k < 0.65 ? s.spr.main : s.spr.cool;
      const r = s.size * (1 - 0.45 * k);
      c.globalAlpha = a > 1 ? 1 : a;
      c.drawImage(spr, s.x - r, s.y - r, r * 2, r * 2);
    }
    for (const r of this.rockets) {
      const depth = r.opts.depth ?? 0;
      const rr = (r.opts.big ? 12 : 7) * this.S + 3;
      c.globalAlpha = 1 - depth * 0.5;
      c.drawImage(this.rocketHead, r.x - rr, r.y - rr, rr * 2, rr * 2);
    }

    // top layer: firework text + skyline in front
    const tc = this.topc;
    tc.globalCompositeOperation = 'source-over';
    tc.globalAlpha = 1;
    tc.clearRect(0, 0, w, h);
    tc.globalCompositeOperation = 'lighter';
    for (const f of this.forms.values()) this.drawForm(tc, f, t);
    tc.globalCompositeOperation = 'source-over';
    this.drawCoins(tc);
    tc.globalAlpha = 1;
    tc.drawImage(this.skyline, 0, 0, w, h);
    tc.globalCompositeOperation = 'lighter';
    for (const bl of this.bulbs) {
      tc.globalAlpha = 0.45 + 0.4 * Math.sin(t * bl.sp + bl.ph) + Math.random() * 0.1;
      tc.drawImage(bl.c, bl.x - bl.r, bl.y - bl.r, bl.r * 2, bl.r * 2);
    }
    this.drawDiyas(tc, t);
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = 'source-over';
  }

  private drawCoins(c: CanvasRenderingContext2D): void {
    for (const k of this.coins) {
      const fade = Math.min(1, (k.life - k.age) / 0.8);
      const sx = Math.cos(k.rot);
      const w = Math.max(0.12, Math.abs(sx)) * k.size;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = fade;
      c.drawImage(this.coinImg, k.x - w, k.y - k.size, w * 2, k.size * 2);
      // glint when the face turns towards us
      if (Math.abs(sx) > 0.96) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = fade * (Math.abs(sx) - 0.96) * 14;
        const g = k.size * 1.5;
        c.drawImage(this.coinGlint, k.x - g, k.y - g, g * 2, g * 2);
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  private drawDiyas(c: CanvasRenderingContext2D, t: number): void {
    for (const d of this.diyaSpots) {
      if (d.on < 0.02) continue;
      const s = d.s;
      const bw = 34 * s, bh = 17 * s;
      const flick = 0.85 + 0.1 * Math.sin(t * d.sp + d.ph) + 0.08 * Math.sin(t * d.sp * 2.3 + d.ph * 2) + Math.random() * 0.05;
      const fx = d.x + bw * 0.28 + Math.sin(t * 3 + d.ph) * 0.6 * s;
      const fy = d.y - bh * 0.72;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.55 * d.on * flick;
      const gr = 46 * s * flick;
      c.drawImage(this.flameGlow, fx - gr, fy - gr, gr * 2, gr * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = Math.min(1, d.on * 1.4);
      c.drawImage(this.diyaImg, d.x - bw / 2, d.y - bh, bw, bh);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = d.on;
      const fw = 7 * s * (0.9 + flick * 0.15), fh = 17 * s * flick;
      c.drawImage(this.flameImg, fx - fw / 2, fy - fh, fw, fh);
    }
  }

  private drawForm(c: CanvasRenderingContext2D, f: Formation, t: number): void {
    if (f.formed > 0.02) {
      const flick = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 17.1) + Math.random() * 0.05;
      c.globalAlpha = Math.min(1, f.formed * f.opts.glow * flick);
      c.drawImage(f.glow, f.gx, f.gy);
    }
    for (const p of f.parts) {
      const r = p.size;
      if (p.ph < 2) {
        const moving = p.ph === 1 ? 1 : 0.85;
        c.globalAlpha = 0.22 * moving;
        c.drawImage(p.spr.main, p.hx2 - r, p.hy2 - r, r * 2, r * 2);
        c.globalAlpha = 0.45 * moving;
        c.drawImage(p.spr.main, p.hx - r, p.hy - r, r * 2, r * 2);
        c.globalAlpha = 0.95;
        c.drawImage(p.ph === 0 ? p.spr.hot : p.spr.main, p.x - r, p.y - r, r * 2, r * 2);
      } else {
        const fl = 0.62 + 0.3 * Math.sin(t * p.spd + p.seed) + Math.random() * 0.08;
        c.globalAlpha = Math.min(1, fl + p.pop * 0.5);
        const rr = r * (1 + p.pop * 0.6);
        c.drawImage(p.pop > 0.35 ? p.spr.hot : p.spr.main, p.x - rr, p.y - rr, rr * 2, rr * 2);
      }
    }
  }
}
