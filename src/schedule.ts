import { FESTIVALS } from './festivals';

export interface Today {
  /** index of tonight's festival, or null outside the six days */
  index: number | null;
  status: 'before' | 'during' | 'after';
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `?date=2026-11-10` simulates another day, for testing the midnight switch. */
export function now(): Date {
  const q = new URLSearchParams(location.search).get('date');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
    const [y, m, d] = q.split('-').map(Number);
    const real = new Date();
    return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds());
  }
  return new Date();
}

/** Local calendar day decides the festival, so it switches at 12:00 midnight wherever the viewer is. */
export function today(d = now()): Today {
  const key = dateKey(d);
  if (key < FESTIVALS[0].date) return { index: null, status: 'before' };
  if (key > FESTIVALS[FESTIVALS.length - 1].date) return { index: null, status: 'after' };
  let index = 0;
  FESTIVALS.forEach((f, i) => {
    if (f.date <= key) index = i;
  });
  return { index, status: 'during' };
}

export function msUntilMidnight(d = new Date()): number {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - d.getTime());
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
