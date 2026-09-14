import { ReminderError, type ReminderErrorCode } from './errors.ts';

export { ReminderError } from './errors.ts';
export const REMINDER_MESSAGE = 'tab-story:reminder';
export type ReminderOperation = 'schedule' | 'reschedule' | 'cancel' | 'complete' | 'snooze' | 'reconcile' | 'test';
export interface ReminderRequest {
  type: typeof REMINDER_MESSAGE;
  operation: ReminderOperation;
  tabId?: number;
  scheduledAt?: number;
  minutes?: number;
}
export type ReminderResponse = { ok: true } | { ok: false; code: ReminderErrorCode };

/** Every UI window delegates to the single service-worker writer. */
async function request(operation: ReminderOperation, options: Partial<ReminderRequest> = {}): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.runtime.sendMessage) {
    throw new ReminderError('reminderUnavailable');
  }
  let response: ReminderResponse;
  try {
    response = await chrome.runtime.sendMessage({ type: REMINDER_MESSAGE, operation, ...options });
  } catch (cause) {
    throw new ReminderError('reminderUnavailable', { cause });
  }
  if (!response) throw new ReminderError('reminderUnavailable');
  if (!response.ok) throw new ReminderError(response.code);
}

export const scheduleTabReminder = (tabId: number, scheduledAt: number) => request('schedule', { tabId, scheduledAt });
export const rescheduleTabReminder = (tabId: number, scheduledAt: number) => request('reschedule', { tabId, scheduledAt });
export const cancelTabReminder = (tabId: number) => request('cancel', { tabId });
export const completeTabReminder = (tabId: number) => request('complete', { tabId });
export const snoozeTabReminder = (tabId: number, minutes = 10) => request('snooze', { tabId, minutes });
export const requestReminderReconciliation = () => request('reconcile');
export const restoreScheduledReminders = requestReminderReconciliation;
export const reconcileMissedReminders = requestReminderReconciliation;
export const testReminderNotification = () => request('test');
