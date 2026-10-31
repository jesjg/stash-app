const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse YYYY-MM-DD (+ optional HH:mm) as a local date. */
export function toDate(day: string, time?: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmt = {
  /** "09" */
  dayNum: (day: string) => pad(toDate(day).getDate()),
  /** "FRI" */
  dow: (day: string) => DOW[toDate(day).getDay()],
  /** "Oct" */
  mon: (day: string) => MON[toDate(day).getMonth()],
  /** "Wed 7 Oct" */
  short: (day: string) => {
    const d = toDate(day);
    return `${DOW_LONG[d.getDay()].slice(0, 3)} ${d.getDate()} ${MON[d.getMonth()]}`;
  },
  /** "Thursday 29 October" */
  full: (day: string) => {
    const d = toDate(day);
    return `${DOW_LONG[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]}`;
  },
  /** "Wednesday 7 October 2026" style without the year when it's this year. */
  long: (day: string) => {
    const d = toDate(day);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return `${DOW_LONG[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
  },
};

/** "Today", "Tomorrow", "In 5 days", or a short date. */
export function relativeDay(day: string, today = dayKey()): string {
  const n = daysBetween(today, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  return fmt.short(day);
}
