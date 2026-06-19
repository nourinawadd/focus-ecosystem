import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';

const SYNC_ENABLED_KEY  = 'calendar.syncEnabled';
const ANCHOR_CAL_ID_KEY = 'calendar.anchorCalendarId';
const ANCHOR_CAL_NAME   = 'Anchor';

export type CalendarEvent = {
  title: string;
  startDate: Date;
  endDate: Date;
};

export function isCalendarSupported(): boolean {
  return Platform.OS === 'ios';
}

export async function isCalendarSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SYNC_ENABLED_KEY)) === 'true';
}

export async function setCalendarSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function requestCalendarPermission(): Promise<boolean> {
  if (!isCalendarSupported()) return false;
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Finds the dedicated "Anchor" calendar, creating it on first use. */
export async function getOrCreateAnchorCalendarId(): Promise<string | null> {
  if (!isCalendarSupported()) return null;
  try {
    const cached = await AsyncStorage.getItem(ANCHOR_CAL_ID_KEY);
    if (cached) return cached;

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const existing = calendars.find(c => c.title === ANCHOR_CAL_NAME);
    if (existing) {
      await AsyncStorage.setItem(ANCHOR_CAL_ID_KEY, existing.id);
      return existing.id;
    }

    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    const id = await Calendar.createCalendarAsync({
      title: ANCHOR_CAL_NAME,
      color: '#2563EB',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.source?.id,
      source: defaultCalendar.source,
      name: ANCHOR_CAL_NAME,
      ownerAccount: defaultCalendar.source?.name ?? ANCHOR_CAL_NAME,
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
    await AsyncStorage.setItem(ANCHOR_CAL_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/** Best-effort: adds a completed session as an event in the Anchor calendar. */
export async function addSessionEvent(event: CalendarEvent & { notes?: string }): Promise<void> {
  if (!isCalendarSupported()) return;
  try {
    if (!(await isCalendarSyncEnabled())) return;
    const calendarId = await getOrCreateAnchorCalendarId();
    if (!calendarId) return;
    await Calendar.createEventAsync(calendarId, {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      notes: event.notes,
      timeZone: undefined,
    });
  } catch {
    // Best-effort only — never block the session-end flow.
  }
}

/** Today's events across all of the device's calendars, sorted by start time. */
export async function getTodayEvents(): Promise<CalendarEvent[]> {
  if (!isCalendarSupported()) return [];
  try {
    if (!(await isCalendarSyncEnabled())) return [];
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map(c => c.id);
    if (calendarIds.length === 0) return [];

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const events = await Calendar.getEventsAsync(calendarIds, start, end);
    return events
      .map(e => ({
        title: e.title,
        startDate: new Date(e.startDate),
        endDate: new Date(e.endDate),
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  } catch {
    return [];
  }
}
