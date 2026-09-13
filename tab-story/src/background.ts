import { ensureRecovery, execute, handleAlarm, handleNotification, recover, serialized } from './reminders/engine';
import { REMINDER_MESSAGE } from './reminders/service';
import { reminderError } from './reminders/errors';
import { handleAI } from './ai/background';
import { BACKUP_ALARM, ensureBackupAlarm, handleBackup } from './backup';

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request?.type !== 'tab-story:backup' || sender.id !== chrome.runtime.id || sender.tab) return;
  void handleBackup(String(request.operation), request.id).then(async result => {
    if (request.operation === 'restore') await serialized(recover);
    respond({ ok: true, ...result });
  }).catch(error => respond({ ok: false, error: error instanceof Error ? error.message : 'Backup failed.' }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === BACKUP_ALARM) void handleBackup('backup').catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { void ensureBackupAlarm().catch(console.error); });
void ensureBackupAlarm().catch(console.error);

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request?.type !== 'tab-story:ai') return;
  if (sender.id !== chrome.runtime.id) return;
  void handleAI(request).then(
    result => respond({ ok: true, ...result }),
    error => respond({
      ok: false,
      code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
      error: error?.name === 'AbortError' || error?.name === 'TimeoutError'
        ? 'Request cancelled or timed out. Please retry.'
        : error instanceof Error ? error.message : 'AI request failed.'
    })
  );
  return true;
});

const runRecovery = () => { void serialized(recover).catch(console.error); };
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
  runRecovery();
});

chrome.runtime.onStartup.addListener(runRecovery);
chrome.alarms.onAlarm.addListener(alarm => { void serialized(() => handleAlarm(alarm)).catch(console.error); });
chrome.notifications.onClicked.addListener(id => { void serialized(() => handleNotification(id)).catch(console.error); });
chrome.notifications.onButtonClicked.addListener((id, button) => { void serialized(() => handleNotification(id, button)).catch(console.error); });
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request?.type !== REMINDER_MESSAGE || sender.id !== chrome.runtime.id) return;
  void serialized(() => execute(request)).then(() => respond({ ok: true }), error => respond({ ok: false, code: reminderError(error, 'reminderDatabase').code }));
  return true;
});
void ensureRecovery().then(runRecovery).catch(console.error);

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  }
});
