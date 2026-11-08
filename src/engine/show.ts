import { AudioEngine } from './audio';
import { FireworksEngine, type ShellType, type LaunchOpts } from './engine';
import { VoiceEngine, type VoiceOption } from './voice';
import { COLORS, rand, pick, weighted, type RGB } from './utils';
import { FESTIVALS, MENU_SCENE, FINALE_SCENE, FINALE_COMBOS, BRAND_LINE, FINALE_TITLE, FINALE_WISH, FAMILY_NAME, FAMILY_WORD, type Festival } from '../festivals';

export type Phase =
  | 'idle' | 'menu'
  // a festival: title → greeting → family-name reveal → tagline → controls
  | 'intro' | 'greeting' | 'reveal' | 'brand' | 'done'
  // grand finale
  | 'f-title' | 'f-barrage' | 'f-brand' | 'f-message' | 'f-done';

export interface SongState {
  available: boolean;
  playing: boolean;
}

export interface ShowCallbacks {
  onPhase: (p: Phase) => void;
  onVoices: (v: VoiceOption[]) => void;
  onSubtitleY: (y: number) => void;
  onComplete: (dayIndex: number) => void;
  onSong: (s: SongState) => void;
}

const DEFAULT_SHELLS: { v: ShellType; w: number }[] = [
  { v: 'peony', w: 3 },
  { v: 'chrysanthemum', w: 3 },
  { v: 'willow', w: 2 },
  { v: 'ring', w: 1 },
  { v: 'palm', w: 1.4 },
  { v: 'strobe', w: 1 },
  { v: 'crackle', w: 1.4 },
];

const BRAND_FONT = 'Montserrat, "Arial Black", Arial, sans-serif';
const GREETING_FONT = 'Cinzel, Georgia, serif';

/** Drop a song file here and it plays on the opening screen and at the end of the grand finale. */
const SONG_URL = 'audio/happy-diwali-song.mp3';

interface Ev { t: number; fn: () => void }

interface Bg {
  every: [number, number];
  xr: [number, number];
  yr: [number, number];
  depth: [number, number];
  scale: number;
  /** keep to the edges so text in the centre stays clear */
  sides?: boolean;
}

type Origin = { x: number; y: number };

/** The director: owns the timeline and keeps fireworks, audio and voice in sync. */
export class Show {
  readonly engine: FireworksEngine;
  readonly audio = new AudioEngine();
  readonly voice: VoiceEngine;
  private t = 0;
  /** bumps on every scene change; stale callbacks compare against it and bail out */
  private gen = 0;
  private unlocked = false;
  private events: Ev[] = [];
  private watchers: { id: string; frac: number; fn: () => void }[] = [];
  private bg: Bg | null = { every: [3.5, 6.5], xr: [0.1, 0.9], yr: [0.12, 0.3], depth: [0.85, 0.9], scale: 1 };
  private bgNext = 1.5;
  private barrage: { from: number; until: number; next: number } | null = null;
  private combos: [RGB, RGB][] = FINALE_COMBOS;
  private shells = DEFAULT_SHELLS;
  private festival: Festival | null = null;
  private current: number | 'finale' | null = null;
  private song: AudioBuffer | null = null;
  /** the opening-screen song plays through a plain <audio> element, so it can start before the Web Audio unlock */
  private opening: HTMLAudioElement | null = null;
  private openingPlaying = false;
  private openingDone = false;
  private hidden = false;

  constructor(host: HTMLElement, private cb: ShowCallbacks) {
    this.engine = new FireworksEngine(host);
    this.engine.audio = this.audio;
    this.engine.setScene({ ...MENU_SCENE, diyas: 0.5, lanterns: 0 });
    this.voice = new VoiceEngine(this.audio);
    this.voice.onVoices = (v) => cb.onVoices(v);
    cb.onVoices(this.voice.options());
    this.engine.onTick = (dt) => this.tick(dt);
    this.engine.onResize = () => this.emitSubtitle();
    document.addEventListener('visibilitychange', this.onVis);
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVis);
    this.stopOpening();
    this.voice.stop();
    this.engine.destroy();
    this.audio.destroy();
  }

  private onVis = (): void => {
    this.hidden = document.hidden;
    if (document.hidden) this.audio.suspend();
    else this.audio.resume();
  };

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
    this.voice.muted = m;
    if (m) this.voice.silence();
    if (this.opening) this.opening.muted = m;
  }

  setVoice(id: string): void {
    this.voice.setChoice(id);
  }

  /** Must be called from the first click (autoplay policy). */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.voice.prime();
    await this.audio.init();
    this.unlocked = true;
    this.audio.startAmbience();
    void this.audio.startMusic();
    void this.voice.loadClips([...FESTIVALS.map((f) => f.id), 'brand', 'finale-title', 'finale-wish']);
    // awaited (it is small) so it is ready even when a ?day=3 link jumps straight into Diwali
    this.song = await this.audio.loadBuffer(SONG_URL);
    this.emitSong();
  }

  // ───────────────────────────── scenes ─────────────────────────────

  private reset(): void {
    this.gen++;
    this.events = [];
    this.watchers = [];
    this.bg = null;
    this.barrage = null;
    this.voice.stop();
    this.stopSong();
    this.engine.dissolve();
  }

  menu(): void {
    this.reset();
    this.festival = null;
    this.current = null;
    this.combos = FINALE_COMBOS;
    this.shells = DEFAULT_SHELLS;
    this.engine.setScene(MENU_SCENE);
    this.bg = { every: [2.2, 4], xr: [0.08, 0.92], yr: [0.1, 0.3], depth: [0.6, 0.85], scale: 0.9 };
    this.bgNext = this.t + 0.8;
    this.setPhase('menu');
  }

  replay(): void {
    if (this.current === 'finale') this.playFinale();
    else if (this.current !== null) this.playDay(this.current);
  }

  playDay(i: number): void {
    this.reset();
    const f = FESTIVALS[i];
    this.festival = f;
    this.current = i;
    this.combos = f.show.combos;
    this.shells = f.show.shells;
    this.engine.setScene(f.show.scene);
    this.setPhase('intro');
    this.intro(f);
    // every day opens with the Happy Diwali song over its title screen; the greeting follows when it ends
    const withSong = !!this.song;
    if (withSong) this.after(0.2, () => this.playSong());
    this.after(withSong ? 5.4 : f.show.intensity === 3 ? 4.2 : 3.4, () => this.greeting(f));
  }

  private intro(f: Festival): void {
    const s = f.show;
    const beats: [number, number, number][] = [
      [0.4, 0.3, 0.27], [1.3, 0.7, 0.23], [2.1, 0.5, 0.19], [2.8, 0.2, 0.3], [3.5, 0.8, 0.26],
      [4.3, 0.38, 0.2], [5.0, 0.64, 0.3], [5.8, 0.25, 0.24], [5.85, 0.75, 0.24], [6.7, 0.5, 0.16],
    ];
    const skip = s.intensity === 1 ? new Set([3, 6, 8]) : new Set<number>();
    beats.forEach(([t, x, y], i) => {
      if (skip.has(i)) return;
      const sig = i === 2 || i === (s.intensity === 1 ? 7 : 6);
      this.after(t, () => (sig ? this.signature(f, x, y) : this.fw(weighted(this.shells), x, y, { whistle: i === 0 || undefined })));
    });
    if (s.intensity >= 2) {
      this.after(3.1, () => this.fw(weighted(this.shells), 0.6, 0.34, { depth: 0.3 }));
      this.after(6.2, () => this.fw(weighted(this.shells), 0.42, 0.3, { depth: 0.25 }));
    }
    if (s.intensity === 3) {
      // the grandest nights get a full barrage behind the greeting
      this.after(6.9, () => (this.barrage = { from: this.t, until: this.t + 2.4, next: this.t }));
      this.after(9.5, () => {
        for (const xf of [0.2, 0.5, 0.8]) this.signature(f, xf, 0.2);
      });
    }
  }

  private signature(f: Festival, xf: number, yf: number): void {
    const e = this.engine;
    const sig = f.show.signature;
    const portrait = e.h > e.w;
    e.launch({
      main: COLORS.gold, ...sig,
      tx: e.w * xf, ty: e.h * (portrait ? yf * 0.85 + 0.04 : yf), whistle: true,
    });
  }

  private greeting(f: Festival): void {
    this.setPhase('greeting');
    this.bg = { every: f.show.greetEvery, xr: [0.06, 0.94], yr: [0.07, 0.24], depth: [0.25, 0.6], scale: 0.85 };
    this.bgNext = this.t + 1.5;
    const start = this.t;
    this.after(1.1, () =>
      this.voice.say({ key: f.id, text: `${f.heading} ${f.wish}`, rate: 0.9 }, this.guard(() => {
        // leave the words on screen long enough to read, even when muted
        this.after(Math.max(1.2, start + 9.5 - this.t), () => this.brandShell());
      })),
    );
  }

  /** The massive orange-and-gold shell whose sparks spell the family name. */
  private brandShell(): void {
    this.setPhase('reveal');
    this.bg = null;
    this.barrage = null;
    const e = this.engine;
    const flight = 2.3;
    this.audio.riser(flight);
    const L = this.nameLayout(e.w, e.h);
    const g = this.gen;
    e.launch({
      type: 'peony', main: COLORS.gold, alt: COLORS.orange, big: true, scale: 1.7, whistle: true,
      x: e.w / 2, tx: e.w / 2, ty: L.cy, flight,
      onExplode: (x, y) => {
        if (g === this.gen) this.reveal([{ x, y }], [0.38, 0.7], [0.85, 1.15], () => this.dayBrand());
      },
    });
  }

  private reveal(origins: Origin[], formAt: [number, number], formDur: [number, number], onFormed: () => void): void {
    this.engine.formText({
      id: 'name', text: FAMILY_NAME, family: BRAND_FONT, weight: 900, spacing: 0.06,
      count: 2100, layout: this.nameLayout,
      palette: [{ c: COLORS.orange, w: 0.56 }, { c: COLORS.amber, w: 0.16 }, { c: COLORS.gold, w: 0.2 }, { c: COLORS.white, w: 0.08 }],
      origin: origins, burst: 620, formAt, formDur, glow: 0.55,
    });
    this.emitSubtitle();
    this.audio.crackle(0.4, 1.6, 70, 0);
    // tied to the particles actually landing, so sync holds even on slow devices
    this.whenFormed('name', 0.8, () => {
      this.audio.shimmer(0.05);
      // sparks drip down from the name to write FAMILY underneath
      this.engine.formText({
        id: 'family', text: FAMILY_WORD, family: GREETING_FONT, weight: 700, spacing: 0.32,
        count: 900, layout: this.familyLayout,
        palette: [{ c: COLORS.gold, w: 0.5 }, { c: COLORS.pale, w: 0.3 }, { c: COLORS.amber, w: 0.2 }],
        origin: 'name', burst: 0, formAt: [0, 0.4], formDur: [0.8, 1.1], glow: 0.35,
      });
      this.whenFormed('family', 0.6, () => {
        this.emitSubtitle();
        onFormed();
      });
    });
  }

  private dayBrand(): void {
    const f = this.festival!;
    const idx = FESTIVALS.indexOf(f);
    this.setPhase('brand');
    this.emitSubtitle();
    this.bg = { every: [0.8, 1.4], xr: [0, 0], yr: [0.08, 0.22], depth: [0.5, 0.7], scale: 0.8, sides: true };
    this.bgNext = this.t + 1.4;
    this.after(0.3, () =>
      this.voice.say({ key: 'brand', text: BRAND_LINE, rate: 0.9 }, this.guard(() =>
        this.after(1.2, () => {
          this.setPhase('done');
          this.cb.onComplete(idx);
          this.bg = { every: [1.6, 3], xr: [0, 0], yr: [0.08, 0.22], depth: [0.55, 0.8], scale: 0.8, sides: true };
        }),
      )),
    );
  }

  playFinale(): void {
    this.reset();
    this.festival = null;
    this.current = 'finale';
    this.combos = FINALE_COMBOS;
    this.shells = DEFAULT_SHELLS;
    this.engine.setScene(FINALE_SCENE);
    this.setPhase('f-title');
    this.bg = { every: [1.2, 2], xr: [0.08, 0.92], yr: [0.08, 0.24], depth: [0.4, 0.7], scale: 0.85 };
    this.bgNext = this.t + 0.5;
    const start = this.t;
    this.after(1.4, () =>
      this.voice.say({ key: 'finale-title', text: FINALE_TITLE.join(' '), rate: 0.85 }, this.guard(() =>
        this.after(Math.max(1, start + 6.5 - this.t), () => this.finaleBarrage()),
      )),
    );
  }

  private finaleBarrage(): void {
    this.setPhase('f-barrage');
    this.bg = null;
    const n = this.engine.w < 700 ? 4 : 7;
    const salvo = (count: number, yf: number, types: ShellType[]) => {
      for (let i = 0; i < count; i++) {
        const xf = 0.08 + (0.84 * i) / (count - 1);
        this.fw(types[i % types.length], xf, yf + (i % 2 ? -0.04 : 0.03), { flight: 1.5, scale: rand(1, 1.2), whistle: i % 3 === 0 });
      }
    };
    this.after(0.2, () => salvo(n, 0.26, ['peony', 'chrysanthemum']));
    this.after(1.6, () => salvo(n - 1, 0.2, ['willow', 'crackle']));
    this.after(3.0, () => salvo(n, 0.28, ['ring', 'strobe', 'palm']));
    this.after(4.6, () => salvo(n, 0.18, ['chrysanthemum', 'willow']));
    this.after(6.4, () => salvo(n, 0.24, ['strobe', 'peony', 'crackle']));
    this.after(0.8, () => (this.barrage = { from: this.t, until: this.t + 5.8, next: this.t }));
    this.after(8.4, () => this.finaleForm());
  }

  /** Several shells burst at once and their sparks all stream together into the family name. */
  private finaleForm(): void {
    const e = this.engine;
    const L = this.nameLayout(e.w, e.h);
    const xs = e.w < 700 ? [0.2, 0.5, 0.8] : [0.14, 0.32, 0.5, 0.68, 0.86];
    const g = this.gen;
    const pts: Origin[] = [];
    const flight = 2.1;
    this.audio.riser(flight);
    xs.forEach((xf, i) => {
      e.launch({
        type: i % 2 ? 'chrysanthemum' : 'peony', main: [COLORS.orange, COLORS.gold, COLORS.white][i % 3], alt: COLORS.gold,
        big: xf === 0.5, scale: 1.3, whistle: i % 2 === 0, x: e.w * xf, tx: e.w * xf, ty: L.cy - e.h * 0.07 * (i % 2), flight,
        onExplode: (x, y) => {
          if (g !== this.gen) return;
          pts.push({ x, y });
          if (pts.length === xs.length) this.reveal(pts, [0.6, 1.5], [1.3, 1.9], () => this.finaleBrand());
        },
      });
    });
  }

  private finaleBrand(): void {
    this.setPhase('f-brand');
    this.emitSubtitle();
    this.bg = { every: [0.7, 1.2], xr: [0, 0], yr: [0.08, 0.22], depth: [0.4, 0.7], scale: 0.85, sides: true };
    this.bgNext = this.t + 1;
    this.after(2.6, () => {
      this.setPhase('f-message');
      this.voice.say({ key: 'finale-wish', text: FINALE_WISH, rate: 0.88 }, this.guard(() =>
        this.after(1, () => {
          this.setPhase('f-done');
          this.bg = { every: [1.4, 2.6], xr: [0, 0], yr: [0.08, 0.22], depth: [0.5, 0.8], scale: 0.8, sides: true };
          this.playSong();
        }),
      ));
    });
  }

  // ───────────────────────────── song ─────────────────────────────

  playSong(): void {
    if (!this.song) return;
    if (this.openingPlaying) this.stopOpening();
    this.audio.playSong(this.song, () => this.emitSong());
    this.emitSong();
  }

  stopSong(): void {
    this.audio.stopSong();
    this.emitSong();
  }

  toggleSong(): void {
    if (this.openingPlaying) this.stopOpening();
    else if (this.audio.songPlaying) this.stopSong();
    else this.playSong();
  }

  /**
   * Plays the song on the opening screen. Browsers block sound until the visitor interacts,
   * so if the autoplay is refused it starts on the first tap, click or key press instead.
   */
  playOpeningSong(): void {
    if (this.openingDone) return;
    window.addEventListener('pointerdown', this.tryOpening, true);
    window.addEventListener('keydown', this.tryOpening, true);
    this.tryOpening();
  }

  private tryOpening = (): void => {
    if (this.openingDone || this.openingPlaying || this.audio.muted) return;
    const el = (this.opening ??= new Audio(SONG_URL));
    el.volume = 0.9;
    el.muted = this.audio.muted;
    el.play().then(
      () => {
        this.openingDone = this.openingPlaying = true;
        window.removeEventListener('pointerdown', this.tryOpening, true);
        window.removeEventListener('keydown', this.tryOpening, true);
        this.audio.duck('song', true);
        el.onended = () => this.stopOpening();
        // keep it to 5 seconds, with a short fade at the end
        window.setTimeout(() => {
          let v = el.volume;
          const fade = window.setInterval(() => {
            v -= 0.09;
            if (v <= 0 || !this.openingPlaying) {
              window.clearInterval(fade);
              this.stopOpening();
            } else el.volume = v;
          }, 50);
        }, 4500);
        this.emitSong();
      },
      () => {
        /* blocked until the first interaction — the listeners will retry */
      },
    );
  };

  private stopOpening(): void {
    window.removeEventListener('pointerdown', this.tryOpening, true);
    window.removeEventListener('keydown', this.tryOpening, true);
    if (!this.opening) return;
    this.opening.pause();
    if (!this.openingPlaying) return;
    this.openingPlaying = false;
    this.audio.duck('song', false);
    this.emitSong();
  }

  private emitSong(): void {
    this.cb.onSong({ available: !!this.song, playing: this.audio.songPlaying || this.openingPlaying });
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private setPhase(p: Phase): void {
    this.cb.onPhase(p);
  }

  private after(dt: number, fn: () => void): void {
    this.events.push({ t: this.t + dt, fn });
    this.events.sort((a, b) => a.t - b.t);
  }

  private guard(fn: () => void): () => void {
    const g = this.gen;
    return () => {
      if (g === this.gen) fn();
    };
  }

  private whenFormed(id: string, frac: number, fn: () => void): void {
    this.watchers.push({ id, frac, fn });
  }

  private fw(type: ShellType, xf: number, yf: number, o: Partial<LaunchOpts> = {}): void {
    const [main, alt] = pick(this.combos);
    const e = this.engine;
    const portrait = e.h > e.w;
    e.launch({
      type, main, alt,
      tx: e.w * xf + rand(-0.03, 0.03) * e.w,
      ty: e.h * (portrait ? yf * 0.85 + 0.04 : yf) + rand(-0.02, 0.02) * e.h,
      scale: rand(0.9, 1.15),
      ...o,
    });
  }

  private randomShell(o: Partial<LaunchOpts>, xr: [number, number], yr: [number, number]): void {
    this.fw(weighted(this.shells), rand(xr[0], xr[1]), rand(yr[0], yr[1]), o);
  }

  private nameLayout = (w: number, h: number) => {
    const narrow = w < 700;
    return { cx: w / 2, cy: h * (narrow ? 0.33 : 0.34), boxW: w * (narrow ? 0.9 : 0.76), boxH: h * (narrow ? 0.11 : 0.2) };
  };

  private familyLayout = (w: number, h: number) => {
    const a = this.engine.box('name') ?? { cx: w / 2, cy: h * 0.34, width: w * 0.7, height: h * 0.15 };
    // on phones the name is short, so FAMILY gets relatively more height to stay readable
    const bh = Math.max(a.height * (w < 700 ? 0.62 : 0.42), 26);
    return { cx: w / 2, cy: a.cy + a.height / 2 + bh * 0.5 + a.height * 0.3, boxW: Math.min(w * 0.8, a.width * 0.75), boxH: bh };
  };

  /** Where the HTML tagline should sit: just below the firework lettering. */
  private emitSubtitle(): void {
    const b = this.engine.box('family') ?? this.engine.box('name');
    if (b) this.cb.onSubtitleY(b.cy + b.height / 2);
    else {
      const L = this.nameLayout(this.engine.w, this.engine.h);
      this.cb.onSubtitleY(L.cy + L.boxH);
    }
  }

  private tick(dt: number): void {
    if (this.hidden) return;
    this.t += dt;
    const t = this.t;
    while (this.events.length && this.events[0].t <= t) this.events.shift()!.fn();
    for (let i = this.watchers.length - 1; i >= 0; i--) {
      const w = this.watchers[i];
      if (this.engine.formed(w.id) >= w.frac) {
        this.watchers.splice(i, 1);
        w.fn();
      }
    }

    const b = this.bg;
    if (b && t >= this.bgNext) {
      this.bgNext = t + rand(b.every[0], b.every[1]);
      const xr: [number, number] = b.sides ? (Math.random() < 0.5 ? [0.05, 0.2] : [0.8, 0.95]) : b.xr;
      const depth = rand(b.depth[0], b.depth[1]);
      this.randomShell({ depth, scale: b.scale, whistle: depth < 0.5 && Math.random() < 0.3 }, xr, b.yr);
    }

    const br = this.barrage;
    if (br && t >= br.next) {
      if (t >= br.until) this.barrage = null;
      else {
        const k = (t - br.from) / (br.until - br.from);
        br.next = t + rand(0.13, 0.28) * (1 - k * 0.4);
        const n = Math.random() < 0.3 + k * 0.4 ? (Math.random() < 0.4 ? 3 : 2) : 1;
        for (let i = 0; i < n; i++) this.randomShell({ depth: rand(0, 0.35), whistle: Math.random() < 0.3 }, [0.05, 0.95], [0.08, 0.32]);
      }
    }
  }
}
