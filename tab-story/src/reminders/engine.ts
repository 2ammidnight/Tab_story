import { db } from '../sidepanel/db';
import type { SavedTab } from '../sidepanel/db';
import { getStoredLocale, translate } from '../i18n/core';
import { ReminderError } from './errors';
import type { ReminderRequest } from './service';
import { showBrowserReminder } from './browserBanner';

export const ALARM_PREFIX = 'tab_story_reminder_';
export const RECOVERY_ALARM = 'tab_story_recovery';
export const SUMMARY_ID = 'tab_story_missed';
export const alarmName = (id: number) => `${ALARM_PREFIX}${id}`;
export const notificationId = (id: number, at: number) => `${ALARM_PREFIX}${id}_${at}`;
export function parseNotification(id: string) {
  const match = /^tab_story_reminder_(\d+)_(\d+)$/.exec(id);
  return match ? { tabId: Number(match[1]), scheduledAt: Number(match[2]) } : null;
}
export function isScheduled(tab: SavedTab | undefined): tab is SavedTab {
  return !!tab && !tab.deletedAt && !tab.completedAt && Number.isFinite(tab.scheduledAt) && tab.scheduledAt! > 0;
}
function validUrl(url: string) {
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}

// All worker entry points share this queue. Failed jobs never poison later jobs.
let tail: Promise<unknown> = Promise.resolve();
export function serialized<T>(job: () => Promise<T>): Promise<T> {
  const next = tail.then(job);
  tail = next.catch(error => console.error('[Tab Story] reminder', error));
  return next;
}

async function clearNotifications(id: number) {
  for (const key of Object.keys(await chrome.notifications.getAll())) {
    if (parseNotification(key)?.tabId === id) await chrome.notifications.clear(key);
  }
  const summary = await db.reminderState.get('missed');
  if (summary) {
    let relevant = false;
    for (const entry of summary.entries) {
      const tab = await db.tabs.get(entry.tabId);
      if (isScheduled(tab) && tab.scheduledAt === entry.scheduledAt) relevant = true;
    }
    if (!relevant) { await chrome.notifications.clear(SUMMARY_ID); await db.reminderState.delete('missed'); }
  }
}
async function register(tab: SavedTab) {
  const name = alarmName(tab.id!);
  const existing = await chrome.alarms.get(name);
  if (existing?.scheduledTime === tab.scheduledAt) return;
  if (!existing && (await chrome.alarms.getAll()).length >= 499) throw new ReminderError('alarmLimit');
  try { await chrome.alarms.create(name, { when: tab.scheduledAt }); }
  catch (cause) { throw new ReminderError('alarmRegistration', { cause }); }
}
export async function ensureRecovery() {
  if (!(await chrome.alarms.get(RECOVERY_ALARM))) {
    await chrome.alarms.create(RECOVERY_ALARM, { periodInMinutes: 1 });
  }
}

export async function execute(request: ReminderRequest) {
  await ensureRecovery();
  if (request.operation === 'test') {
    if (await chrome.notifications.getPermissionLevel() !== 'granted') throw new ReminderError('notificationPermission');
    try {
      await chrome.notifications.clear('tab_story_notification_test');
      await chrome.notifications.create('tab_story_notification_test', {
        type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title: 'Tab Story reminder', message: 'Your desktop notification test. Scheduled tabs use this alert.',
        silent: false, priority: 2, requireInteraction: true,
      });
    } catch (cause) { throw new ReminderError('notificationFailed', { cause }); }
    return;
  }
  if (request.operation === 'reconcile') return recover();
  const id = request.tabId;
  if (!Number.isSafeInteger(id) || id! < 1) throw new ReminderError('invalidTab');
  const tab = await db.tabs.get(id!);
  if (!tab) {
    if (request.operation === 'cancel') { await chrome.alarms.clear(alarmName(id!)); await clearNotifications(id!); return; }
    throw new ReminderError('missingTab');
  }
  if (request.operation === 'cancel' || request.operation === 'complete') {
    // Persist cancellation first so an interrupted cleanup cannot deliver a stale reminder.
    await db.tabs.update(id!, {
      scheduledAt: undefined, notifiedScheduledAt: undefined,
      completedAt: request.operation === 'complete' ? (tab.completedAt || Date.now()) : undefined,
      completedScheduledAt: request.operation === 'complete' ? (tab.scheduledAt || tab.completedScheduledAt) : undefined,
    });
    try { await chrome.alarms.clear(alarmName(id!)); await clearNotifications(id!); }
    catch (cause) { throw new ReminderError('alarmCancellation', { cause }); }
    return;
  }
  if (tab.deletedAt) throw new ReminderError('deletedTab');
  if (!validUrl(tab.url)) throw new ReminderError('invalidUrl');
  let at = request.scheduledAt;
  if (request.operation === 'snooze') {
    if (!isScheduled(tab)) throw new ReminderError('invalidSchedule');
    const minutes = request.minutes ?? 10;
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10080) throw new ReminderError('invalidSnooze');
    at = Date.now() + minutes * 60000;
  } else if (!['schedule', 'reschedule'].includes(request.operation)) throw new ReminderError('invalidSchedule');
  if (!Number.isSafeInteger(at) || at! > 8640000000000000) throw new ReminderError('invalidSchedule');
  if (at! <= Date.now()) throw new ReminderError('pastSchedule');
  if (tab.scheduledAt !== at || tab.completedAt) {
    await db.tabs.update(id!, { scheduledAt: at, completedAt: undefined, completedScheduledAt: undefined, notifiedScheduledAt: undefined });
  }
  // DB remains authoritative on API failure; the recovery alarm retries it.
  await register({ ...tab, scheduledAt: at });
  // Cleanup failure must not turn an already registered schedule into a failed save.
  await clearNotifications(id!).catch(error => console.warn('[Tab Story] notification cleanup', error));
}

async function deliver(tabs: SavedTab[]) {
  if (!tabs.length) return;
  const locale = await getStoredLocale();
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  // Re-read immediately before delivery to exclude edits performed by the panel.
  const current: SavedTab[] = [];
  for (const candidate of tabs) {
    const tab = await db.tabs.get(candidate.id!);
    if (isScheduled(tab) && tab.scheduledAt === candidate.scheduledAt && tab.notifiedScheduledAt !== tab.scheduledAt) current.push(tab);
  }
  if (!current.length) return;
  const bannerShown = await showBrowserReminder(current);
  const nativeAllowed = await chrome.notifications.getPermissionLevel().catch(() => 'denied') === 'granted';
  if (!nativeAllowed && !bannerShown) throw new ReminderError('notificationPermission');
  const single = current.length === 1 ? current[0] : undefined;
  const id = single ? notificationId(single.id!, single.scheduledAt!) : SUMMARY_ID;
  const grouped = [...current];
  if (!single) {
    const previous = await db.reminderState.get('missed');
    for (const entry of previous?.entries || []) {
      if (grouped.some(tab => tab.id === entry.tabId)) continue;
      const tab = await db.tabs.get(entry.tabId);
      if (isScheduled(tab) && tab.scheduledAt === entry.scheduledAt) grouped.push(tab);
    }
    await db.reminderState.put({ id: 'missed', entries: grouped.map(tab => ({ tabId: tab.id!, scheduledAt: tab.scheduledAt! })) });
  }
  try {
    if (nativeAllowed) await chrome.notifications.create(id, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: single ? '🔖 Time for a quick review' : `🔖 ${grouped.length} pages to revisit`,
      silent: false, priority: 2, requireInteraction: true,
      message: single ? `${single.title.slice(0, 120)}\n${validUrl(single.url) ? new URL(single.url).hostname : 'Saved page'} · ${new Date(single.scheduledAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : grouped.slice(0, 3).map(tab => tab.title.slice(0, 60)).join(' · '),
      buttons: single ? [{ title: t('notifications.open') }, { title: t('notifications.snooze') }] : [{ title: t('notifications.calendar') }],
    });
  } catch (cause) { if (!bannerShown) throw new ReminderError('notificationFailed', { cause }); }
  await db.transaction('rw', db.tabs, async () => {
    for (const delivered of current) {
      const tab = await db.tabs.get(delivered.id!);
      if (isScheduled(tab) && tab.scheduledAt === delivered.scheduledAt) {
        await db.tabs.update(tab.id!, { notifiedScheduledAt: tab.scheduledAt });
      }
    }
  });
}

export async function recover() {
  await ensureRecovery();
  const tabs = await db.tabs.toArray();
  const active = new Map(tabs.filter(isScheduled).map(tab => [tab.id!, tab]));
  const now = Date.now();
  const overdueCount = [...active.values()].filter(tab => tab.scheduledAt! <= now).length;
  // Keep overdue reminders visible even if system banners or sound are disabled.
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
    await chrome.action.setBadgeText({ text: overdueCount ? String(Math.min(overdueCount, 99)) + (overdueCount > 99 ? '+' : '') : '' });
  } catch (error) { console.warn('[Tab Story] reminder badge unavailable', error); }
  const failures: unknown[] = [];
  for (const alarm of await chrome.alarms.getAll()) {
    if (!alarm.name.startsWith(ALARM_PREFIX)) continue;
    const tab = active.get(Number(alarm.name.slice(ALARM_PREFIX.length)));
    if (!tab || tab.scheduledAt! <= now || tab.scheduledAt !== alarm.scheduledTime) {
      try { await chrome.alarms.clear(alarm.name); } catch (error) { failures.push(error); }
    }
  }
  for (const tab of active.values()) {
    if (tab.scheduledAt! > now) {
      try { await register(tab); } catch (error) { failures.push(error); }
    }
  }
  try {
    for (const key of Object.keys(await chrome.notifications.getAll())) {
      const entry = parseNotification(key);
      if (entry && active.get(entry.tabId)?.scheduledAt !== entry.scheduledAt) await chrome.notifications.clear(key);
    }
    const summary = await db.reminderState.get('missed');
    if (summary && !summary.entries.some(entry => active.get(entry.tabId)?.scheduledAt === entry.scheduledAt)) {
      await chrome.notifications.clear(SUMMARY_ID);
      await db.reminderState.delete('missed');
    }
  } catch (error) { console.warn('[Tab Story] stale notification cleanup', error); }
  await deliver([...active.values()].filter(tab => tab.scheduledAt! <= now && tab.notifiedScheduledAt !== tab.scheduledAt));
  if (failures.length) throw failures[0];
}

export async function handleAlarm(alarm: chrome.alarms.Alarm) {
  if (alarm.name === RECOVERY_ALARM) return recover();
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const tab = await db.tabs.get(Number(alarm.name.slice(ALARM_PREFIX.length)));
  if (!isScheduled(tab)) return;
  if (tab.scheduledAt! > Date.now()) return register(tab);
  // Batch all currently overdue items, including alarms arriving after sleep.
  await recover();
}
export async function handleNotification(id: string, button = 0) {
  if (id === 'tab_story_notification_test') { await chrome.notifications.clear(id); return; }
  if (id === SUMMARY_ID) {
    const summary = await db.reminderState.get('missed');
    if (summary) {
      for (const entry of summary.entries) {
        const tab = await db.tabs.get(entry.tabId);
        if (isScheduled(tab) && tab.scheduledAt === entry.scheduledAt) {
          await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html#calendar') });
          break;
        }
      }
    }
    await chrome.notifications.clear(id);
    return;
  }
  const entry = parseNotification(id);
  if (!entry) return;
  const tab = await db.tabs.get(entry.tabId);
  if (!isScheduled(tab) || tab.scheduledAt !== entry.scheduledAt) { await chrome.notifications.clear(id); return; }
  if (button === 1) await execute({ type: 'tab-story:reminder', operation: 'snooze', tabId: entry.tabId, minutes: 10 });
  else {
    if (!validUrl(tab.url)) throw new ReminderError('invalidUrl');
    await chrome.tabs.create({ url: tab.url });
  }
  await chrome.notifications.clear(id);
}
