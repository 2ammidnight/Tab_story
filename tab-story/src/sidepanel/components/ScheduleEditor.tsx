import { useId, useState } from 'react';
import type { SavedTab } from '../db';
import { useI18n } from '../../i18n/useI18n';
import { parseLocalSchedule, toLocalDateInput, toLocalTimeInput } from '../../reminders/dates';
import { scheduleTabReminder } from '../../reminders/service';
import { getAuthToken, createCalendarEvent } from '../hooks/useGoogleAuth';

export function ScheduleEditor({ tab, initialDate, onClose }: { tab: SavedTab; initialDate?: Date; onClose: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [initial] = useState(() => tab.scheduledAt || Math.ceil((Date.now() + 60000) / 60000) * 60000);
  const [quickMinutes, setQuickMinutes] = useState<number | null>(null);
  const [date, setDate] = useState(toLocalDateInput(initialDate?.getTime() ?? initial));
  const [time, setTime] = useState(toLocalTimeInput(initial));
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setGoogleError('');
    try {
      const at = quickMinutes === null ? parseLocalSchedule(date, time) : Date.now() + quickMinutes * 60000;
      await scheduleTabReminder(tab.id!, at);
      if (google) {
        try {
          const token = await getAuthToken();
          await createCalendarEvent(token, { title: tab.title, description: t('calendar.googleDescription') + '\n\n' + tab.url, startDateTime: new Date(at).toISOString(), endDateTime: new Date(at + 3600000).toISOString() });
        } catch (cause) {
          setSaved(true);
          setGoogleError(cause instanceof Error ? cause.message : 'Google Calendar connection failed.');
          setSavedMessage('Reminder saved. Google sync failed.');
          return;
        }
      }
      setSaved(true);
      const allowed = await chrome.notifications.getPermissionLevel().catch(() => 'unknown');
      setSavedMessage(`Saved · ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${allowed === 'granted' ? '' : ' · Enable desktop notifications in system settings.'}`);
    } catch (cause) { setError(cause instanceof Error && cause.message.startsWith('errors.') ? cause.message : 'app.operationFailed'); }
    finally { setBusy(false); }
  }
  return <form className="schedule-editor" onSubmit={save}>
    <p className="resource-title">{tab.title}</p>
    <label htmlFor={`${id}-date`}>{t('calendar.date')}</label>
    <input id={`${id}-date`} type="date" required value={date} onChange={e => { setQuickMinutes(null); setDate(e.target.value); }} disabled={busy || saved} />
    <label htmlFor={`${id}-time`}>{t('calendar.time')}</label>
    <input id={`${id}-time`} type="time" required value={time} onChange={e => { setQuickMinutes(null); setTime(e.target.value); }} disabled={busy || saved} />
    {!saved && <div className="action-row">{[1, 5, 10].map(minutes => <button key={minutes} type="button" aria-pressed={quickMinutes === minutes} disabled={busy} onClick={() => {
      const at = Date.now() + minutes * 60000;
      setQuickMinutes(minutes);
      setDate(toLocalDateInput(at)); setTime(toLocalTimeInput(at));
    }}>In {minutes} min</button>)}</div>}
    <small>{quickMinutes ? `${quickMinutes} min after Save` : Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
    <details><summary>Google reminders (optional)</summary>
      <label className="checkbox-row"><input type="checkbox" checked={google} onChange={e => setGoogle(e.target.checked)} disabled={busy || saved} />Calendar + email</label>
      {google && <small>Separate Google event. Edit or cancel it in Google Calendar.</small>}
    </details>
    {error && <p role="alert">{t(error)}</p>}
    {savedMessage && <p role="status">{savedMessage}</p>}
    {googleError && <p role="alert">{googleError}</p>}
    <div className="action-row">
      {!saved && <button type="submit" disabled={busy}>{t(busy ? 'app.loading' : 'common.save')}</button>}
      <button type="button" onClick={onClose} disabled={busy}>{t(saved ? 'app.close' : 'common.cancel')}</button>
    </div>
  </form>;
}
