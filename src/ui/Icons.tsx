import type { IconName } from '../festivals';

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function FestivalIcon({ name, className = 'h-9 w-9' }: { name: IconName; className?: string }) {
  switch (name) {
    case 'coin':
      return (
        <svg viewBox="0 0 32 32" className={className} {...base}>
          <circle cx="15" cy="17" r="10" fill="currentColor" fillOpacity={0.12} />
          <circle cx="15" cy="17" r="6.5" />
          <path d="M12.5 14.5h5M12.5 16.5h5M13.5 14.5c3 0 3 4-0.5 4l4 3.5" />
          <path d="M26 4v4M24 6h4" />
        </svg>
      );
    case 'diya':
      return (
        <svg viewBox="0 0 32 32" className={className} {...base}>
          <path d="M16 4c2.6 3.4 3.4 5.6 3.4 7.2a3.4 3.4 0 0 1-6.8 0C12.6 9.6 13.4 7.4 16 4z" fill="currentColor" fillOpacity={0.25} />
          <path d="M4 18c4 1.4 20 1.4 24 0-1 5.6-5.6 8.6-12 8.6S5 23.6 4 18z" fill="currentColor" fillOpacity={0.12} />
          <path d="M16 14.6v3.2" />
        </svg>
      );
    case 'burst':
      return (
        <svg viewBox="0 0 32 32" className={className} {...base}>
          <circle cx="16" cy="14" r="2" fill="currentColor" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r1 = 5, r2 = i % 2 ? 9 : 12;
            return <path key={i} d={`M${16 + Math.cos(a) * r1} ${14 + Math.sin(a) * r1}L${16 + Math.cos(a) * r2} ${14 + Math.sin(a) * r2}`} />;
          })}
          <path d="M16 30v-6" strokeDasharray="1.5 2" />
        </svg>
      );
    case 'hill':
      return (
        <svg viewBox="0 0 32 32" className={className} {...base}>
          <path d="M3 26 12 12l5 7 3-4 9 11z" fill="currentColor" fillOpacity={0.14} />
          <circle cx="23" cy="8" r="3" />
          <path d="M9 26c1.5-3 4-4.5 7-4.5" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 32 32" className={className} {...base}>
          <path d="M16 27S4.5 20 4.5 12.3A5.8 5.8 0 0 1 16 9.6a5.8 5.8 0 0 1 11.5 2.7C27.5 20 16 27 16 27z" fill="currentColor" fillOpacity={0.15} />
          <path d="M25 3.5v3M23.5 5h3M6 4v2.4M4.8 5.2h2.4" />
        </svg>
      );
    case 'sunrise':
      return (
        <svg viewBox="0 0 32 32" className={className} {...base}>
          <path d="M8 22a8 8 0 0 1 16 0" fill="currentColor" fillOpacity={0.15} />
          <path d="M3 22h26M7 26h18M16 6v4M6.5 10.5l2.8 2.8M25.5 10.5l-2.8 2.8M2.5 17h3M26.5 17h3" />
        </svg>
      );
  }
}

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...base} strokeWidth={1.8}>
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" fillOpacity={0.15} />
      {muted ? (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...base} strokeWidth={1.8}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function ReplayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...base} strokeWidth={1.8}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" />
      <path d="M4 4v4.6h4.6" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...base} strokeWidth={1.8}>
      <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" />
    </svg>
  );
}

export function MusicIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...base} strokeWidth={1.8}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" fillOpacity={0.2} />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...base} strokeWidth={1.8}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor" fillOpacity={0.2} />
      <circle cx="17.5" cy="16" r="2.5" fill="currentColor" fillOpacity={0.2} />
    </svg>
  );
}
