// Client-side hints that mirror the backend rules (backend/fleet/validators.py), so users
// see problems as they type. The server stays the authority: its 400s are always shown.

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const LICENSE_PLATE_PATTERN = /^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/;
export const FIRST_VIN_MODEL_YEAR = 1981;
/** "Overdue" means no service for more than this many days (or never serviced). */
export const OVERDUE_AFTER_DAYS = 365;

/** Same normalisation as the backend: trim, collapse inner spaces, upper-case. */
export function normalizeIdentifier(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ').toUpperCase();
}

export function latestModelYear(today: string): number {
  return Number(today.slice(0, 4)) + 1;
}

export function vinError(vin: string): string | null {
  if (!vin) return 'VIN is required.';
  if (!VIN_PATTERN.test(vin)) return '17 letters or digits; I, O and Q are never used.';
  return null;
}

export function licensePlateError(plate: string): string | null {
  if (!plate) return 'License plate is required.';
  if (plate.length > 10) return 'At most 10 characters.';
  if (!LICENSE_PLATE_PATTERN.test(plate)) {
    return 'Letters and digits, optionally separated by single spaces or hyphens.';
  }
  return null;
}

export function yearError(year: string, today: string): string | null {
  const latest = latestModelYear(today);
  if (!/^\d{4}$/.test(year)) return 'Enter a four-digit year.';
  const value = Number(year);
  if (value < FIRST_VIN_MODEL_YEAR || value > latest) {
    return `Between ${FIRST_VIN_MODEL_YEAR} and ${latest}.`;
  }
  return null;
}
