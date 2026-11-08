import { rand, clamp } from './utils';

/**
 * All sound is synthesised live with the Web Audio API — no files needed.
 * Signal chain: voices → bus → (dry + convolution reverb) → compressor → master → speakers.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private ambienceNodes: AudioNode[] = [];
  private ambienceGain: GainNode | null = null;
  private voiceBus!: GainNode;
  private musicGain: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicTimer = 0;
  private mNext = 0;
  private tNext = 0;
  private mBeat = 0;
  private mNote = 5;
  private tString = 0;
  private ducks = { voice: false, song: false };
  private songSrc: AudioBufferSourceNode | null = null;
  private voiceSrc: AudioBufferSourceNode | null = null;
  muted = false;

  get ready(): boolean {
    return !!this.ctx;
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Must be called from a user gesture (autoplay policy). */
  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
      return;
    }
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // iOS unlock: play one silent sample inside the gesture
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = silent;
    s.connect(ctx.destination);
    s.start(0);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.95;
    this.bus = ctx.createGain();

    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.4, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;

    this.bus.connect(dry).connect(this.comp);
    this.bus.connect(reverb).connect(wet).connect(this.comp);
    this.comp.connect(this.master).connect(ctx.destination);

    // voice-over and songs: mostly dry so the words stay clear, with a touch of the same room
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.comp);
    const vSend = ctx.createGain();
    vSend.gain.value = 0.12;
    this.voiceBus.connect(vSend).connect(reverb);

    this.noise = this.makeNoise(2.5, false);
    this.brown = this.makeNoise(4, true);
    await ctx.resume().catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.95, this.ctx.currentTime, 0.06);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }
  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  private makeNoise(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.bus);
      return p;
    }
    return this.bus;
  }

  private env(param: AudioParam, t: number, attack: number, peak: number, decay: number): void {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSrc(rate = 1): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    return s;
  }

  /** Rocket lift-off: ignition crack, rushing whoosh and (optionally) the classic rising whistle. */
  launch(duration: number, pan: number, depth = 0, whistle = true): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const vol = 1 - depth * 0.75;
    const out = this.out(pan * 0.8);

    // ignition
    const ig = this.noiseSrc(1.2);
    const igf = ctx.createBiquadFilter();
    igf.type = 'lowpass';
    igf.frequency.value = 2600;
    const igg = ctx.createGain();
    this.env(igg.gain, t, 0.004, 0.22 * vol, 0.14);
    ig.connect(igf).connect(igg).connect(out);
    ig.start(t, rand(0, 2));
    ig.stop(t + 0.25);

    // whoosh
    const wn = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(450, t);
    bp.frequency.exponentialRampToValueAtTime(2800, t + duration);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.13 * vol, t + 0.08);
    wg.gain.exponentialRampToValueAtTime(0.05 * vol, t + duration * 0.7);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    wn.connect(bp).connect(wg).connect(out);
    wn.start(t, rand(0, 2));
    wn.stop(t + duration + 0.05);

    if (whistle) {
      const f0 = rand(900, 1300);
      const f1 = f0 * rand(2.0, 2.6);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + duration * 0.95);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(f0 * 2, t);
      o2.frequency.exponentialRampToValueAtTime(f1 * 2, t + duration * 0.95);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(16, 26);
      const lfoG = ctx.createGain();
      lfoG.gain.value = f0 * 0.025;
      lfo.connect(lfoG);
      lfoG.connect(o.frequency);
      lfoG.connect(o2.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045 * vol, t + 0.18);
      g.gain.setValueAtTime(0.04 * vol, t + duration * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(out);
      for (const n of [o, o2, lfo]) {
        n.start(t);
        n.stop(t + duration + 0.05);
      }
    }
  }

  /** Shell burst: deep boom + thump + high crack. Sound arrives slightly after the light, like the real thing. */
  explode(scale: number, pan: number, depth = 0, delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01 + delay;
    const s = clamp(scale, 0.3, 2.2);
    const vol = (1 - depth * 0.7) * Math.pow(s, 0.55);
    const out = this.out(pan * 0.7);

    const n = this.noiseSrc(rand(0.55, 0.8));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400 * (1 - depth * 0.55), t);
    lp.frequency.exponentialRampToValueAtTime(110, t + 1.1 * s);
    const ng = ctx.createGain();
    this.env(ng.gain, t, 0.005, 0.85 * vol, 1.5 + s * 0.7);
    n.connect(lp).connect(ng).connect(out);
    n.start(t, rand(0, 2));
    n.stop(t + 2.6 + s);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95 * (1.2 - s * 0.2), t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.55);
    const og = ctx.createGain();
    this.env(og.gain, t, 0.004, 0.75 * vol, 0.8);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 1);

    const c = this.noiseSrc(1.5);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    this.env(cg.gain, t, 0.002, 0.3 * vol * (1 - depth * 0.6), 0.09);
    c.connect(hp).connect(cg).connect(out);
    c.start(t, rand(0, 2));
    c.stop(t + 0.2);
  }

  /** Glittering crackle: dozens of tiny pops. */
  crackle(delay: number, duration: number, density: number, pan: number, depth = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01 + delay;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1700;
    const g = ctx.createGain();
    g.gain.value = 0.55 * (1 - depth * 0.65);
    hp.connect(g).connect(this.out(pan * 0.8));
    const count = Math.min(140, Math.round(duration * density));
    for (let i = 0; i < count; i++) {
      const tt = t0 + duration * Math.pow(Math.random(), 1.3);
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = rand(0.7, 1.6);
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(rand(0.15, 1), tt);
      eg.gain.exponentialRampToValueAtTime(0.0001, tt + rand(0.006, 0.025));
      src.connect(eg).connect(hp);
      src.start(tt, rand(0, 2.3), 0.04);
    }
  }

  /** Cinematic swell leading into the brand reveal. */
  riser(duration: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + duration * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.08);
    n.connect(bp).connect(g).connect(this.bus);
    n.start(t);
    n.stop(t + duration + 0.1);

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(110, t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + duration);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.05, t + duration * 0.9);
    og.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.1);
    o.connect(lp).connect(og).connect(this.bus);
    o.start(t);
    o.stop(t + duration + 0.15);
  }

  /** Golden sparkle chime + sub impact for the logo moment. */
  shimmer(delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01 + delay;
    const notes = [1318.5, 1568, 1760, 2093, 2349.3, 2637, 3136, 3520];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * rand(0.998, 1.002);
      const g = ctx.createGain();
      const st = t + i * 0.07 + rand(0, 0.04);
      this.env(g.gain, st, 0.01, 0.035, 2.2);
      o.connect(g).connect(this.out(rand(-0.6, 0.6)));
      o.start(st);
      o.stop(st + 2.4);
    });
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(62, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 2.5);
    const sg = ctx.createGain();
    this.env(sg.gain, t, 0.02, 0.5, 2.8);
    sub.connect(sg).connect(this.bus);
    sub.start(t);
    sub.stop(t + 3);
  }

  /** Night-air bed: filtered brown-noise wind + a slow, warm drone. */
  startAmbience(): void {
    if (!this.ctx || this.ambienceGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(1, t + 4);
    master.connect(this.bus);
    this.ambienceGain = master;

    const wind = ctx.createBufferSource();
    wind.buffer = this.brown;
    wind.loop = true;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 520;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(wlp).connect(wg).connect(master);
    wind.start();
    this.ambienceNodes.push(wind);

    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 850;
    padLp.connect(master);
    [55, 82.41, 110, 164.81, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = rand(-6, 6);
      const g = ctx.createGain();
      g.gain.value = 0.008;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(0.04, 0.12);
      const lg = ctx.createGain();
      lg.gain.value = 0.005;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(padLp);
      o.start();
      lfo.start();
      this.ambienceNodes.push(o, lfo);
    });
  }

  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || '';
      if (type.includes('text/html')) return null; // SPA fallback page, not audio
      const arr = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }

  /** Plays a voice-over clip on the dry voice bus. */
  playVoice(buf: AudioBuffer, gain = 1.1): void {
    if (!this.ctx) return;
    this.stopVoice();
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.voiceBus);
    s.start(this.ctx.currentTime + 0.005);
    this.voiceSrc = s;
  }

  stopVoice(): void {
    try {
      this.voiceSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.voiceSrc = null;
  }

  /** Plays a song over the show (at most `max` seconds, faded out); the background music steps aside until it ends. */
  playSong(buf: AudioBuffer, onEnd?: () => void, max = 5): void {
    if (!this.ctx) return;
    this.stopSong();
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime + 0.05;
    const len = Math.min(max, buf.duration);
    g.gain.setValueAtTime(0.9, t);
    g.gain.setValueAtTime(0.9, t + len - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    s.connect(g).connect(this.voiceBus);
    s.onended = () => {
      if (this.songSrc !== s) return;
      this.songSrc = null;
      this.duck('song', false);
      onEnd?.();
    };
    s.start(t, 0, len);
    this.songSrc = s;
    this.duck('song', true);
  }

  stopSong(): void {
    const s = this.songSrc;
    this.songSrc = null;
    try {
      s?.stop();
    } catch {
      /* already stopped */
    }
    this.duck('song', false);
  }

  get songPlaying(): boolean {
    return !!this.songSrc;
  }

  /** Lowers the music while the voice speaks (and nearly silences it for a song). */
  duck(kind: 'voice' | 'song', on: boolean): void {
    this.ducks[kind] = on;
    if (!this.ctx || !this.musicDuck) return;
    const v = this.ducks.song ? 0.08 : this.ducks.voice ? 0.4 : 1;
    this.musicDuck.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  /** Little metallic pings for the coin showers. */
  coins(delay: number, pan: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01 + delay;
    const out = this.out(pan * 0.7);
    for (let i = 0; i < 9; i++) {
      const t = t0 + Math.pow(Math.random(), 1.5) * 1.4;
      const f = rand(2600, 4800);
      for (const [mul, a] of [[1, 0.02], [2.76, 0.008], [5.4, 0.004]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        this.env(g.gain, t, 0.002, a, rand(0.25, 0.5));
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.6);
      }
    }
  }

  // ───────────────────────────── background music ─────────────────────────────

  /**
   * Gentle festive instrumental. Uses /audio/music.mp3 when present, otherwise plays a
   * live tanpura drone with santoor-style plucks in a major-pentatonic raga.
   */
  async startMusic(): Promise<void> {
    if (!this.ctx || this.musicGain) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 6);
    const duck = ctx.createGain();
    gain.connect(duck).connect(this.bus);
    this.musicGain = gain;
    this.musicDuck = duck;
    this.duck('voice', this.ducks.voice);

    const file = await this.loadBuffer('audio/music.mp3');
    if (file) {
      const s = ctx.createBufferSource();
      s.buffer = file;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      s.connect(g).connect(gain);
      s.start();
      return;
    }
    this.mNext = this.tNext = ctx.currentTime + 0.3;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
  }

  destroy(): void {
    window.clearInterval(this.musicTimer);
    this.ctx?.close().catch(() => {});
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.musicGain) return;
    const now = ctx.currentTime;
    if (this.mNext < now - 0.5) this.mNext = this.tNext = now + 0.1;
    const beat = 60 / 76 / 2; // eighth notes at 76 bpm
    while (this.mNext < now + 0.4) {
      this.melodyStep(this.mNext);
      this.mNext += beat;
    }
    // tanpura: Pa – Sa – Sa – low Sa, round and round
    const strings = [164.81, 220, 220, 110];
    while (this.tNext < now + 0.4) {
      this.tanpura(strings[this.tString % 4], this.tNext);
      this.tString++;
      this.tNext += this.tString % 4 === 0 ? 1.6 : 1.05;
    }
  }

  private tanpura(f: number, t: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + 3.2);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.04, 0.018, 4.2);
    lp.connect(g).connect(this.musicGain!);
    for (const d of [1, 1.0035, 2.001]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * d;
      const og = ctx.createGain();
      og.gain.value = d > 2 ? 0.35 : 1;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + 4.4);
    }
  }

  private pluck(f: number, t: number, a: number, pan: number): void {
    const ctx = this.ctx!;
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (out) {
      out.pan.value = pan;
      out.connect(this.musicGain!);
    }
    const dest: AudioNode = out ?? this.musicGain!;
    for (const [mul, amp, dec] of [[1, 1, 1.6], [2, 0.35, 0.9], [3.01, 0.15, 0.5], [4.2, 0.06, 0.25]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      this.env(g.gain, t, 0.003, a * amp, dec);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dec + 0.1);
    }
  }

  private bell(t: number): void {
    const ctx = this.ctx!;
    for (const [mul, a] of [[1, 0.02], [2.76, 0.009], [5.4, 0.005], [8.93, 0.002]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 880 * mul;
      const g = ctx.createGain();
      this.env(g.gain, t, 0.003, a, 4);
      o.connect(g).connect(this.musicGain!);
      o.start(t);
      o.stop(t + 4.2);
    }
  }

  private melodyStep(t: number): void {
    // A major pentatonic across two octaves (Sa Re Ga Pa Dha)
    const scale = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25, 739.99, 880];
    const b = this.mBeat++;
    const inPhrase = b % 32;
    if (b % 64 === 0 && Math.random() < 0.8) this.bell(t);
    // breathe: the last bars of each phrase rest, phrases resolve to Sa
    if (inPhrase >= 26) return;
    if (inPhrase === 24 || inPhrase === 25) {
      if (inPhrase === 24) {
        this.mNote = Math.random() < 0.5 ? 5 : 0;
        this.pluck(scale[this.mNote], t, 0.03, 0);
      }
      return;
    }
    if (Math.random() > (b % 2 === 0 ? 0.75 : 0.4)) return;
    const step = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
    let n = this.mNote + step;
    if (n < 2) n += 2;
    if (n > 9) n -= 2;
    this.mNote = n;
    const f = scale[n];
    const pan = rand(-0.35, 0.35);
    this.pluck(f, t, 0.026, pan);
    // santoor-style tremolo on some notes
    if (Math.random() < 0.18) {
      for (let i = 1; i <= 3; i++) this.pluck(f, t + i * 0.075, 0.026 * (1 - i * 0.22), pan);
    }
  }
}
