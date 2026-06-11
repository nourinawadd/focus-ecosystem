// Timezone-aware date helpers. Sessions/stats store `dateStr` in the user's
// local calendar day (frontend-supplied), so any server-side computation that
// derives an hour-of-day or a "today" boundary must use the user's IANA
// timezone rather than the server's. See User.settings.timezone.

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** True if `tz` is an IANA zone Intl can resolve. */
export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Break a Date into local-time pieces for the given IANA timezone.
 * Returns { year, month, day, hour (0-23), minute, weekday (0=Sun), dateStr }.
 * Falls back to UTC for an unknown timezone.
 */
export function toUserDate(date, tz = 'UTC') {
  const zone = isValidTimezone(tz) ? tz : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12:   false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(date);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;   // some engines emit '24' for midnight

  return {
    year:    Number(get('year')),
    month:   Number(get('month')),
    day:     Number(get('day')),
    hour,
    minute:  Number(get('minute')),
    weekday: WEEKDAY[get('weekday')] ?? 0,
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** Current calendar date (YYYY-MM-DD) in the user's timezone. */
export function userTodayStr(tz = 'UTC') {
  return toUserDate(new Date(), tz).dateStr;
}

/** Shift a YYYY-MM-DD string by n days (negative = backward). Pure UTC math, DST-safe. */
export function shiftDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Whole-day difference toStr - fromStr (both YYYY-MM-DD). */
export function diffDays(fromStr, toStr) {
  const a = Date.parse(`${fromStr}T00:00:00Z`);
  const b = Date.parse(`${toStr}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Day-of-week (0=Sun) for a YYYY-MM-DD string, independent of server tz. */
export function weekdayOfDateStr(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}
