import type { AudioEngine } from './audio';

export interface VoiceOption {
  id: string;
  label: string;
}

export interface Line {
  /** also the recording's file name: public/voice/<key>.mp3 */
  key: string;
  text: string;
  rate?: number;
  pitch?: number;
}

/**
 * Scores the voices installed on this device so we pick the most natural one:
 * neural / "Natural" / "Online" voices (Edge, Windows 11), Apple Premium/Enhanced, Google voices,
 * with a bonus for Indian English. Novelty voices are pushed to the bottom.
 */
function score(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  const l = v.lang.toLowerCase().replace('_', '-');
  let s = 0;
  if (/natural|neural/.test(n)) s += 60;
  if (/online/.test(n)) s += 20;
  if (/premium/.test(n)) s += 45;
  if (/enhanced/.test(n)) s += 35;
  if (/google/.test(n)) s += 28;
  if (l === 'en-in' || /india/.test(n)) s += 18;
  if (l === 'en-gb' || l === 'en-us') s += 6;
  if (/(neerja|prabhat|rishi|veena|aria|jenny|guy|andrew|brian|emma|ava|daniel|samantha|serena|arthur|libby|sonia|ryan|thomas)/.test(n)) s += 10;
  if (/(compact|espeak|novelty|whisper|bad news|bells|zarvox|trinoids|albert|bubbles|cellos|organ|boing|jester|superstar|wobble|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|junior|ralph|fred|kathy)/.test(n)) s -= 80;
  if (!v.localService) s += 4;
  return s;
}

/** Spelled the way it sounds, so English speech engines don't say "Nik-harj". */
function spoken(text: string): string {
  return text.replace(/Nikharge/gi, 'Nikhar-gay');
}

export class VoiceEngine {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  private choice = 'auto';
  private clips = new Map<string, AudioBuffer | null>();
  /** the utterance being spoken, kept alive so Chrome does not garbage-collect it and drop its events */
  current: SpeechSynthesisUtterance | null = null;
  private pending: { fired: boolean; timer: number } | null = null;
  muted = false;
  onVoices: ((opts: VoiceOption[]) => void) | null = null;

  constructor(private audio: AudioEngine) {
    if (!this.synth) return;
    this.refresh();
    this.synth.addEventListener?.('voiceschanged', () => this.refresh());
    // Some browsers populate voices late and never fire the event
    let tries = 0;
    const iv = window.setInterval(() => {
      tries++;
      if (this.voices.length || tries > 20) window.clearInterval(iv);
      this.refresh();
    }, 250);
  }

  private refresh(): void {
    if (!this.synth) return;
    const all = this.synth.getVoices().filter((v) => /^en/i.test(v.lang));
    all.sort((a, b) => score(b) - score(a));
    const changed = all.length !== this.voices.length;
    this.voices = all;
    if (changed && this.onVoices) this.onVoices(this.options());
  }

  options(): VoiceOption[] {
    const best = this.voices[0];
    const opts: VoiceOption[] = [{ id: 'auto', label: best ? `Auto · ${short(best.name)}` : 'Auto' }];
    for (const v of this.voices.slice(0, 14)) opts.push({ id: v.voiceURI, label: `${short(v.name)} (${v.lang})` });
    return opts;
  }

  setChoice(id: string): void {
    this.choice = id;
  }

  private voice(): SpeechSynthesisVoice | null {
    if (this.choice !== 'auto') {
      const v = this.voices.find((x) => x.voiceURI === this.choice);
      if (v) return v;
    }
    return this.voices[0] ?? null;
  }

  /** Call inside the first click so mobile browsers allow speech later. */
  prime(): void {
    if (!this.synth) return;
    try {
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
    } catch {
      /* ignore */
    }
  }

  /** Optional studio recordings in /public/voice take priority over speech synthesis. */
  async loadClips(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (k) => {
        if (this.clips.has(k)) return;
        this.clips.set(k, null);
        this.clips.set(k, await this.audio.loadBuffer(`voice/${k}.mp3`));
      }),
    );
  }

  /**
   * Speaks a line and calls `onEnd` when it finishes, so the show can move on in sync.
   * When muted (or speech is unavailable) `onEnd` still fires after the time it would take to read the line.
   */
  say(line: Line, onEnd?: () => void): void {
    this.stop();
    const rate = line.rate ?? 0.92;
    const words = line.text.split(/\s+/).length;
    const estimate = words / (2.55 * rate) + 0.6;
    const p = { fired: false, timer: 0 };
    this.pending = p;
    const done = () => {
      if (p.fired) return;
      p.fired = true;
      window.clearTimeout(p.timer);
      this.audio.duck('voice', false);
      onEnd?.();
    };
    const after = (s: number) => (p.timer = window.setTimeout(done, s * 1000));

    if (this.muted) return void after(estimate);
    const clip = this.clips.get(line.key);
    if (clip) {
      this.audio.duck('voice', true);
      this.audio.playVoice(clip);
      return void after(clip.duration + 0.1);
    }
    const synth = this.synth;
    if (!synth) return void after(estimate);

    const speak = (v: SpeechSynthesisVoice | null, canRetry: boolean) => {
      const u = new SpeechSynthesisUtterance(spoken(line.text));
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else u.lang = 'en-IN';
      u.rate = rate;
      u.pitch = line.pitch ?? 1;
      u.volume = 1;
      let started = false;
      u.onstart = () => (started = true);
      u.onend = done;
      u.onerror = (e) => {
        if (canRetry && e.error !== 'interrupted' && e.error !== 'canceled') fallback();
        else done();
      };
      this.current = u;
      synth.resume(); // Chrome can get stuck in a paused state
      synth.speak(u);
      // online voices (Google, Microsoft Online) sometimes never start: switch to an on-device voice
      if (canRetry) window.setTimeout(() => !started && !p.fired && fallback(), 2000);
    };
    const fallback = () => {
      if (p.fired) return;
      const old = this.current;
      if (old) old.onstart = old.onend = old.onerror = null;
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      window.setTimeout(() => !p.fired && speak(this.localVoice(), false), 80);
    };

    try {
      this.audio.duck('voice', true);
      const v = this.voice();
      const remote = !!v && !v.localService && !!this.localVoice();
      // speaking right after cancel() is silently dropped by Chrome, so give it a moment
      window.setTimeout(() => !p.fired && speak(v, remote), 80);
      // safety net for engines that never fire onend
      after(estimate * 1.7 + 5);
    } catch {
      after(estimate);
    }
  }

  /** Best voice that runs on the device itself (no network needed). */
  private localVoice(): SpeechSynthesisVoice | null {
    return this.voices.find((v) => v.localService) ?? null;
  }

  /** Stops speaking without firing the pending callback. */
  stop(): void {
    if (this.pending) {
      this.pending.fired = true;
      window.clearTimeout(this.pending.timer);
      this.pending = null;
    }
    this.current = null;
    this.audio.stopVoice();
    this.audio.duck('voice', false);
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
  }

  /** Mute mid-line: cuts the sound but lets the pending callback still fire, so the show keeps going. */
  silence(): void {
    this.audio.stopVoice();
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
  }
}

function short(name: string): string {
  return name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s+Online\s*\(Natural\)/i, ' (Natural)')
    .replace(/\s*-\s*English.*$/i, '')
    .trim();
}
