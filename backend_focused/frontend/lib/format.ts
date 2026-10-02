// Dates from the API are calendar dates (`YYYY-MM-DD`). They are handled as UTC
// midnights so that formatting never shifts them by a day: `new Date('2026-10-01')`
// shown in a US time zone would read 30 September.

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const MONEY_FORMAT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const COMPACT_MONEY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

function toUtcMillis(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function formatDate(isoDate: string): string {
  return DATE_FORMAT.format(toUtcMillis(isoDate));
}

export function formatMoney(amount: number): string {
  return MONEY_FORMAT.format(amount);
}

export function formatCompactMoney(amount: number): string {
  return COMPACT_MONEY_FORMAT.format(amount);
}

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

/** Today's date in UTC as `YYYY-MM-DD`: the server validates "not in the future" in UTC. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Same calendar day a year earlier (the backend's "last 12 months"); 29 Feb -> 28 Feb. */
export function oneYearBefore(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const previous = `${Number(year) - 1}-${month}-${day}`;
  return isIsoDate(previous) ? previous : `${Number(year) - 1}-${month}-28`;
}

/** Whole days from `isoDate` to `today` (both `YYYY-MM-DD`). */
export function daysBetween(isoDate: string, today: string): number {
  return Math.round((toUtcMillis(today) - toUtcMillis(isoDate)) / 86_400_000);
}

export function formatDaysAgo(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${formatNumber(days)} days ago`;
}

/** `YYYY-MM-DD` that is a real calendar date (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
