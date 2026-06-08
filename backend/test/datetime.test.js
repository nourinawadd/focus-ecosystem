import { describe, it, expect } from 'vitest';
import {
  isValidTimezone, toUserDate, userTodayStr, shiftDateStr, diffDays, weekdayOfDateStr,
} from '../utils/datetime.js';

// Pure unit tests for the date helpers that underpin streaks, statistics and
// the analytics time-bucketing. No DB or app needed.
describe('datetime utils', () => {
  describe('isValidTimezone', () => {
    it('accepts real IANA zones and rejects junk', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Europe/Istanbul')).toBe(true);
      expect(isValidTimezone('Not/AZone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone(null)).toBe(false);
    });
  });

  describe('shiftDateStr', () => {
    it('shifts forward and backward', () => {
      expect(shiftDateStr('2026-06-08', 1)).toBe('2026-06-09');
      expect(shiftDateStr('2026-06-08', -1)).toBe('2026-06-07');
      expect(shiftDateStr('2026-06-08', 0)).toBe('2026-06-08');
    });

    it('crosses month and year boundaries', () => {
      expect(shiftDateStr('2026-01-31', 1)).toBe('2026-02-01');
      expect(shiftDateStr('2026-12-31', 1)).toBe('2027-01-01');
      expect(shiftDateStr('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('handles leap vs non-leap February', () => {
      expect(shiftDateStr('2024-02-28', 1)).toBe('2024-02-29');   // leap
      expect(shiftDateStr('2026-02-28', 1)).toBe('2026-03-01');   // non-leap
    });

    it('is DST-safe (pure UTC math, no skipped days)', () => {
      expect(shiftDateStr('2026-03-07', 1)).toBe('2026-03-08');
      expect(shiftDateStr('2026-03-08', 1)).toBe('2026-03-09');
    });
  });

  describe('diffDays', () => {
    it('computes whole-day differences (to - from)', () => {
      expect(diffDays('2026-06-08', '2026-06-08')).toBe(0);
      expect(diffDays('2026-06-08', '2026-06-09')).toBe(1);
      expect(diffDays('2026-06-09', '2026-06-08')).toBe(-1);
      expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    });
  });

  describe('weekdayOfDateStr', () => {
    it('returns 0=Sun..6=Sat independent of server tz', () => {
      expect(weekdayOfDateStr('2026-06-07')).toBe(0);   // Sunday
      expect(weekdayOfDateStr('2026-06-08')).toBe(1);   // Monday
      expect(weekdayOfDateStr('2026-06-13')).toBe(6);   // Saturday
    });
  });

  describe('toUserDate / userTodayStr', () => {
    it('rolls the calendar day across timezones', () => {
      const d = new Date('2026-06-08T23:30:00Z');   // 8th in UTC, 9th in Istanbul (+3)
      expect(toUserDate(d, 'UTC').dateStr).toBe('2026-06-08');
      expect(toUserDate(d, 'Europe/Istanbul').dateStr).toBe('2026-06-09');
    });

    it('rolls the hour-of-day across zones', () => {
      const d = new Date('2026-06-08T12:00:00Z');
      expect(toUserDate(d, 'UTC').hour).toBe(12);
      expect(toUserDate(d, 'America/New_York').hour).toBe(8);   // EDT (UTC-4)
    });

    it('falls back to UTC for an unknown timezone', () => {
      const d = new Date('2026-06-08T23:30:00Z');
      expect(toUserDate(d, 'Not/AZone').dateStr).toBe('2026-06-08');
    });

    it('userTodayStr returns a YYYY-MM-DD string', () => {
      expect(userTodayStr('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
