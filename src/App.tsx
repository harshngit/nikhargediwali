import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Show, type Phase, type SongState } from './engine/show';
import type { VoiceOption } from './engine/voice';
import { FAMILY, FESTIVALS, FINALE_TITLE, FINALE_WISH, TAGLINE } from './festivals';
import { today as getToday, msUntilMidnight, formatDate, type Today } from './schedule';
import { FestivalIcon, GridIcon, MusicIcon, ReplayIcon, ShareIcon, SpeakerIcon } from './ui/Icons';

type Current = number | 'finale' | null;

const APP_NAME = 'Six Nights of Light';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** `?day=3` opens straight into that celebration after the first click; `?finale` into the finale. */
function deepLink(): Current {
  const q = new URLSearchParams(location.search);
  if (q.has('finale')) return 'finale';
  const d = Number(q.get('day'));
  return d >= 1 && d <= FESTIVALS.length ? d - 1 : null;
}

const SHOWING: Phase[] = ['intro', 'greeting', 'reveal', 'brand', 'done', 'f-title', 'f-barrage', 'f-brand', 'f-message', 'f-done'];

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<Show | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [muted, setMuted] = useState<boolean>(() => load('asynk-muted', false));
  const [voices, setVoices] = useState<VoiceOption[]>([{ id: 'auto', label: 'Auto' }]);
  const [voiceId, setVoiceId] = useState('auto');
  const [subY, setSubY] = useState<number | null>(null);
  const [song, setSong] = useState<SongState>({ available: false, playing: false });
  const [current, setCurrent] = useState<Current>(null);
  const [playId, setPlayId] = useState(0);
  const [celebrated, setCelebrated] = useState<number[]>(() => load('asynk-celebrated', []));
  const [today, setToday] = useState<Today>(() => getToday());
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const link = useRef<Current>(deepLink());

  useEffect(() => {
    if (!hostRef.current) return;
    const show = new Show(hostRef.current, {
      onPhase: setPhase,
      onVoices: setVoices,
      onSubtitleY: setSubY,
      onSong: setSong,
      onComplete: (i) =>
        setCelebrated((prev) => {
          if (prev.includes(i)) return prev;
          const next = [...prev, i];
          save('asynk-celebrated', next);
          return next;
        }),
    });
    show.setMuted(load('asynk-muted', false));
    show.playOpeningSong();
    showRef.current = show;
    return () => show.destroy();
  }, []);

  // The highlighted festival follows the calendar and switches at local midnight.
  useEffect(() => {
    let timer = 0;
    const refresh = () => setToday(getToday());
    const arm = () => {
      timer = window.setTimeout(() => {
        refresh();
        arm();
      }, msUntilMidnight());
    };
    arm();
    // timers drift while a laptop sleeps, so re-check whenever the tab comes back
    const onVis = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const open = useCallback((c: Current) => {
    const s = showRef.current;
    if (!s) return;
    setCurrent(c);
    setPlayId((n) => n + 1);
    if (c === null) s.menu();
    else if (c === 'finale') s.playFinale();
    else s.playDay(c);
  }, []);

  const begin = useCallback(() => {
    const s = showRef.current;
    if (!s || starting) return;
    setStarting(true);
    void s.unlock().finally(() => {
      setStarting(false);
      open(link.current);
      link.current = null;
    });
  }, [open, starting]);

  const next = useCallback(() => {
    if (typeof current !== 'number') return;
    open(current < FESTIVALS.length - 1 ? current + 1 : 'finale');
  }, [current, open]);

  const replay = () => {
    setPlayId((n) => n + 1);
    showRef.current?.replay();
  };

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      showRef.current?.setMuted(!m);
      save('asynk-muted', !m);
      return !m;
    });
  }, []);

  const notify = (text: string) => setToast({ id: Date.now(), text });

  const share = async () => {
    const f = typeof current === 'number' ? FESTIVALS[current] : null;
    const url = new URL(location.href);
    url.search = '';
    if (f) url.searchParams.set('day', String(f.day));
    else url.searchParams.set('finale', '');
    const text = f ? `${f.heading}\n${f.wish}\n— The ${FAMILY}` : `${FINALE_WISH}\n— The ${FAMILY}`;
    const href = url.toString().replace(/=$/, '');
    if (navigator.share) {
      try {
        await navigator.share({ title: APP_NAME, text, url: href });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${href}`);
      notify('Greeting link copied ✨');
    } catch {
      notify(href);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement) return;
      if (e.key.toLowerCase() === 'm') toggleMute();
      if ((e.key === 'Enter' || e.key === ' ') && phase === 'idle') {
        e.preventDefault();
        begin();
      }
      if (e.key === 'Escape' && SHOWING.includes(phase)) open(null);
      if (e.key === 'ArrowRight' && phase === 'done') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, begin, next, open, toggleMute]);

  const fest = typeof current === 'number' ? FESTIVALS[current] : null;
  const accent: CSSProperties = {
    ['--accent' as string]: fest?.accent ?? '#FFBA42',
    ['--accent2' as string]: fest?.accent2 ?? '#FF6A00',
  };
  const showing = SHOWING.includes(phase);
  const finaleOpen = celebrated.length >= FESTIVALS.length || today.status === 'after';
  const tonight = today.index !== null ? FESTIVALS[today.index] : null;
  const linked = link.current;
  const eyebrow =
    typeof linked === 'number'
      ? `A ${FESTIVALS[linked].name} greeting for you`
      : tonight
        ? `Tonight · ${tonight.name}`
        : today.status === 'before'
          ? `Diwali begins ${formatDate(FESTIVALS[0].date)}`
          : 'A Diwali Celebration';

  return (
    <div className="fixed inset-0 overflow-hidden bg-night text-white select-none" style={accent}>
      <div ref={hostRef} className="absolute inset-0" />

      {/* cinematic vignette */}
      <div className="pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />

      {/* transition curtain between celebrations */}
      {playId > 0 && <div key={playId} className="pointer-events-none absolute inset-0 z-[4] animate-curtain bg-night" />}

      {/* ─── top bar ─── */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          {showing ? (
            <>
              <button onClick={() => open(null)} className={chip} aria-label="All celebrations" title="All celebrations (Esc)">
                <GridIcon />
                <span className="hidden sm:inline">All Celebrations</span>
              </button>
              <nav className="flex items-center gap-1.5" aria-label="Celebrations">
                {FESTIVALS.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => open(i)}
                    aria-label={`Day ${f.day}: ${f.name}`}
                    title={f.name}
                    className="group grid h-6 w-4 place-items-center"
                  >
                    <span
                      className="block h-1.5 rounded-full transition-all duration-500 group-hover:opacity-100"
                      style={{
                        width: current === i ? 18 : 6,
                        background: current === i ? f.accent : celebrated.includes(i) ? `${f.accent}aa` : 'rgba(255,255,255,0.25)',
                        boxShadow: current === i ? `0 0 10px ${f.accent}` : undefined,
                      }}
                    />
                  </button>
                ))}
              </nav>
            </>
          ) : (
            <span className={`font-display text-xs tracking-[0.3em] text-gold/80 uppercase transition-opacity duration-700 sm:text-sm ${phase === 'menu' ? 'opacity-100' : 'opacity-0'}`}>
              {APP_NAME}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {song.available && phase !== 'idle' && (
            <button onClick={() => showRef.current?.toggleSong()} className={chip} title="Happy Diwali song">
              <MusicIcon playing={song.playing} />
              <span className="hidden sm:inline">{song.playing ? 'Stop song' : 'Happy Diwali'}</span>
            </button>
          )}
          <label className="sr-only" htmlFor="voice">Voice</label>
          <select
            id="voice"
            value={voiceId}
            onChange={(e) => {
              setVoiceId(e.target.value);
              showRef.current?.setVoice(e.target.value);
            }}
            className="hidden max-w-[12rem] cursor-pointer truncate rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 backdrop-blur-md transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand/60 md:block"
            title="Narration voice (the most natural voice on this device is picked automatically)"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id} className="bg-[#0b0d1c] text-white">
                {v.id === 'auto' ? '🎙 ' : ''}
                {v.label}
              </option>
            ))}
          </select>
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-white/75 backdrop-blur-md transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <SpeakerIcon muted={muted} />
          </button>
        </div>
      </div>

      {/* ─── opening screen ─── */}
      <Layer on={phase === 'idle'} className="flex flex-col items-center justify-center px-6 text-center" exit="scale-105 blur-sm">
        <div className="mb-9 flex animate-rise items-center gap-3 sm:mb-11 sm:gap-5">
          <span className="h-px w-6 bg-linear-to-r from-transparent to-gold/70 sm:w-16" />
          <p className="accent-text font-display text-[0.95rem] font-bold tracking-[0.14em] whitespace-nowrap uppercase sm:text-2xl sm:tracking-[0.18em]">{APP_NAME}</p>
          <span className="h-px w-6 bg-linear-to-l from-transparent to-gold/70 sm:w-16" />
        </div>
        <p className="mb-6 font-display text-[0.68rem] uppercase tracking-[0.5em] text-gold/75 sm:text-xs">{eyebrow}</p>
        <h1 className="mb-6 font-display text-[2rem] leading-[1.15] font-normal text-white/90 text-glow sm:text-5xl lg:text-6xl">
          Six Days. Six Celebrations.
          <br />
          <span className="accent-text font-bold">Endless Light.</span>
        </h1>
        <p className="mb-11 max-w-md text-sm font-light tracking-wide text-white/60 sm:text-base">A little festive magic, made with love by the {FAMILY}.</p>
        <PrimaryButton onClick={begin} disabled={phase !== 'idle' || starting}>
          Let the Celebrations Begin ✨
        </PrimaryButton>
        <p className="mt-8 text-xs tracking-wide text-white/35">Sound on for the full experience</p>
      </Layer>

      {/* ─── the six celebrations ─── */}
      <Layer on={phase === 'menu'} className="overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center px-4 pt-20 pb-24 sm:px-8">
          <p className="mb-3 font-display text-[0.68rem] uppercase tracking-[0.5em] text-gold/70 sm:text-xs">Six Days of Diwali</p>
          <h2 className="mb-9 text-center font-display text-2xl text-white/90 text-glow sm:mb-12 sm:text-4xl">Choose a celebration</h2>
          <div className="grid w-full grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {FESTIVALS.map((f, i) => {
              const isToday = today.index === i;
              const done = celebrated.includes(i);
              return (
                <button
                  key={f.id}
                  onClick={() => open(i)}
                  data-today={isToday}
                  className="fest-card flex min-h-[10.5rem] animate-card flex-col items-start p-4 text-left sm:min-h-[13rem] sm:p-6"
                  style={{ ['--a' as string]: f.accent, animationDelay: `${0.08 * i + 0.15}s` }}
                >
                  <div className="mb-auto flex w-full items-center justify-between">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-white/45 sm:text-xs">Day {f.day}</span>
                    {isToday ? (
                      <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-night sm:text-[0.65rem]" style={{ background: f.accent }}>
                        Tonight
                      </span>
                    ) : done ? (
                      <span className="text-xs" style={{ color: f.accent }} title="Celebrated">✦</span>
                    ) : null}
                  </div>
                  <FestivalIcon name={f.icon} className="icon my-3 h-8 w-8 sm:my-4 sm:h-10 sm:w-10" />
                  <h3 className="font-display text-base leading-tight text-white sm:text-2xl">{f.name}</h3>
                  <p className="mt-1 text-[0.68rem] tracking-wide text-white/45 sm:text-sm">{f.sub ?? formatDate(f.date)}</p>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => finaleOpen && open('finale')}
            disabled={!finaleOpen}
            className={`mt-8 animate-card rounded-full border px-7 py-3 text-sm tracking-[0.2em] transition sm:mt-10 ${
              finaleOpen
                ? 'border-gold/50 bg-brand/10 text-gold hover:border-gold hover:bg-brand/20 hover:text-white'
                : 'cursor-default border-white/10 bg-white/[0.03] text-white/40'
            }`}
            style={{ animationDelay: '0.75s' }}
          >
            ✦ GRAND FINALE
            {!finaleOpen && (
              <span className="mt-1 block text-[0.65rem] tracking-[0.12em] text-white/35">
                Unlocks after all six · {celebrated.length}/{FESTIVALS.length} celebrated
              </span>
            )}
          </button>
        </div>
      </Layer>

      {/* ─── festival title card ─── */}
      <Layer on={phase === 'intro'} className="pointer-events-none flex flex-col items-center justify-center px-6 text-center" exit="scale-[1.03] blur-sm">
        {fest && (
          <div key={playId}>
            <p className="mb-4 animate-rise text-[0.68rem] uppercase tracking-[0.5em] text-white/55 sm:text-xs">
              Day {fest.day} of {FESTIVALS.length}
            </p>
            <h2 className="accent-text animate-rise font-display text-5xl font-bold sm:text-7xl" style={{ animationDelay: '0.2s' }}>
              {fest.name}
            </h2>
            {fest.sub && (
              <p className="mt-4 animate-rise font-display text-sm tracking-[0.3em] text-white/60 uppercase sm:text-base" style={{ animationDelay: '0.45s' }}>
                {fest.sub}
              </p>
            )}
          </div>
        )}
      </Layer>

      {/* ─── greeting ─── */}
      <Layer on={phase === 'greeting'} className="pointer-events-none flex items-center justify-center px-5 pt-[14vh] text-center" exit="-translate-y-3 blur-md">
        {fest && (
          <div key={playId} className="relative max-w-4xl">
            <div className="absolute -inset-x-16 -inset-y-12 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(1,2,8,0.6),transparent_70%)]" />
            <p className="mb-5 animate-rise text-[0.65rem] uppercase tracking-[0.45em] sm:text-xs" style={{ color: fest.accent }}>
              Happy {fest.name}
            </p>
            <h2 className="font-display text-[1.85rem] leading-tight font-bold sm:text-5xl lg:text-6xl">
              {fest.heading.split(' ').map((w, i) => (
                <span key={i} className="accent-text inline-block animate-word" style={{ animationDelay: `${0.25 + i * 0.13}s` }}>
                  {w}&nbsp;
                </span>
              ))}
            </h2>
            <p
              className="mx-auto mt-6 max-w-2xl animate-rise text-[0.95rem] leading-relaxed font-light text-white/80 text-glow sm:text-xl"
              style={{ animationDelay: `${0.6 + fest.heading.split(' ').length * 0.13}s` }}
            >
              {fest.wish}
            </p>
          </div>
        )}
      </Layer>

      {/* ─── finale title ─── */}
      <Layer on={phase === 'f-title'} className="pointer-events-none flex flex-col items-center justify-center px-6 text-center" exit="scale-110 blur-md">
        <div key={playId}>
          <h2 className="animate-word font-display text-4xl text-white/90 text-glow sm:text-6xl" style={{ animationDelay: '0.3s' }}>
            {FINALE_TITLE[0]}
          </h2>
          <h2 className="accent-text mt-3 animate-word font-display text-3xl font-bold sm:text-6xl" style={{ animationDelay: '1.4s' }}>
            {FINALE_TITLE[1]}
          </h2>
        </div>
      </Layer>

      {/* ─── tagline under the firework logo ─── */}
      <div
        className={`pointer-events-none absolute inset-x-0 z-10 px-4 text-center transition-opacity duration-1000 ${
          ['brand', 'done', 'f-brand', 'f-message', 'f-done'].includes(phase) ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ top: (subY ?? window.innerHeight * 0.5) + 14 }}
      >
        {['brand', 'done', 'f-brand', 'f-message', 'f-done'].includes(phase) && (
          <p key={playId} className="animate-tagline font-display text-xs text-pale uppercase [text-shadow:0_0_18px_rgba(255,150,40,0.7)] sm:text-xl">
            {TAGLINE}
          </p>
        )}
        <div className={`mx-auto mt-7 max-w-2xl transition-all duration-[1600ms] sm:mt-10 ${phase === 'f-message' || phase === 'f-done' ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
          <p className="text-[0.95rem] leading-relaxed font-light text-white/85 text-glow sm:text-xl">{FINALE_WISH}</p>
        </div>
      </div>

      {/* ─── controls after a celebration ─── */}
      <BottomBar on={phase === 'done'}>
        <GhostButton onClick={() => open(null)} label="All" icon={<GridIcon />} />
        <GhostButton onClick={replay} label="Replay" icon={<ReplayIcon />} />
        <GhostButton onClick={share} label="Share" icon={<ShareIcon />} />
        <PrimaryButton onClick={next} small>
          {current === FESTIVALS.length - 1 ? 'Grand Finale ✨' : 'Next Celebration →'}
        </PrimaryButton>
      </BottomBar>

      <BottomBar on={phase === 'f-done'}>
        <GhostButton onClick={replay} label="Replay" icon={<ReplayIcon />} />
        <GhostButton onClick={share} label="Share" icon={<ShareIcon />} />
        <PrimaryButton onClick={() => open(null)} small>
          Celebrate Again 🎆
        </PrimaryButton>
      </BottomBar>

      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 bottom-[22vh] z-40 flex justify-center px-4" onAnimationEnd={() => setToast(null)}>
          <div className="animate-toast rounded-full border border-white/10 bg-black/60 px-5 py-2.5 text-sm text-white/85 backdrop-blur-md">{toast.text}</div>
        </div>
      )}
    </div>
  );
}

const chip =
  'flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs tracking-wide text-white/75 backdrop-blur-md transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 sm:px-4';

function Layer({ on, className = '', exit = '', children }: { on: boolean; className?: string; exit?: string; children: ReactNode }) {
  return (
    <div
      aria-hidden={!on}
      className={`absolute inset-0 z-10 transition-all duration-[1200ms] ease-out ${on ? 'opacity-100' : `pointer-events-none opacity-0 ${exit}`} ${className}`}
    >
      {children}
    </div>
  );
}

function BottomBar({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-x-0 bottom-[6vh] z-20 flex flex-wrap items-center justify-center gap-2 px-4 transition-all duration-1000 sm:bottom-[9vh] sm:gap-3 ${
        on ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, disabled, small, children }: { onClick: () => void; disabled?: boolean; small?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative rounded-full font-sans font-semibold tracking-wide text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/50 ${
        small ? 'px-6 py-3 text-sm sm:px-7' : 'px-9 py-4 text-base sm:px-11 sm:text-lg'
      }`}
    >
      <span className="absolute inset-0 animate-halo rounded-full bg-brand/40 blur-xl" />
      <span className="absolute inset-0 rounded-full bg-gradient-to-b from-[#ff8a2a] to-brand shadow-[0_0_30px_rgba(255,106,0,0.65),inset_0_1px_0_rgba(255,255,255,0.35)] transition group-hover:shadow-[0_0_55px_rgba(255,130,20,0.9),inset_0_1px_0_rgba(255,255,255,0.45)] group-active:scale-[0.97]" />
      <span className="relative">{children}</span>
    </button>
  );
}

function GhostButton({ onClick, label, icon }: { onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-gold/25 bg-black/35 px-4 py-3 text-xs tracking-[0.15em] text-gold/85 uppercase backdrop-blur-md transition hover:border-gold/60 hover:bg-brand/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:px-5"
    >
      {icon}
      {label}
    </button>
  );
}
