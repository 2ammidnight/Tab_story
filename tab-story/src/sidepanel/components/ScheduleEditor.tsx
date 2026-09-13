import { useId, useState } from 'react';
import type { SavedTab } from '../db';
import { db } from '../db';
import { useI18n } from '../../i18n/useI18n';
import { parseLocalSchedule, toLocalDateInput, toLocalTimeInput } from '../../reminders/dates';
import { scheduleTabReminder } from '../../reminders/service';
import { getAuthToken, createCalendarEvent, backupToGoogleDrive } from '../hooks/useGoogleAuth';

export function ScheduleEditor({ tab, initialDate, onClose }: { tab: SavedTab; initialDate?: Date; onClose: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [initial] = useState(() => tab.scheduledAt || Date.now() + 3600000);
  const [date, setDate] = useState(toLocalDateInput(initialDate?.getTime() ?? initial));
  const [time, setTime] = useState(toLocalTimeInput(initial));
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const at = parseLocalSchedule(date, time);
      await scheduleTabReminder(tab.id!, at);
      if (google) {
        try {
          const token = await getAuthToken();
          await createCalendarEvent(token, { title: tab.title, description: t('calendar.googleDescription') + '\n\n' + tab.url, startDateTime: new Date(at).toISOString(), endDateTime: new Date(at + 3600000).toISOString() });
          await backupToGoogleDrive(token, { tabs: await db.tabs.toArray(), folders: await db.folders.toArray() });
        } catch { setSaved(true); setError('calendar.googleFailed'); return; }
      }
      onClose();
    } catch (cause) { setError(cause instanceof Error && cause.message.startsWith('errors.') ? cause.message : 'app.operationFailed'); }
    finally { setBusy(false); }
  }
  return <form className="schedule-editor" onSubmit={save}>
    <p className="resource-title">{tab.title}</p>
    <label htmlFor={`${id}-date`}>{t('calendar.date')}</label>
    <input id={`${id}-date`} type="date" required value={date} onChange={e => setDate(e.target.value)} disabled={busy || saved} />
    <label htmlFor={`${id}-time`}>{t('calendar.time')}</label>
    <input id={`${id}-time`} type="time" required value={time} onChange={e => setTime(e.target.value)} disabled={busy || saved} />
    <small>{t('calendar.localTime')}</small>
    <label className="checkbox-row"><input type="checkbox" checked={google} onChange={e => setGoogle(e.target.checked)} disabled={busy || saved} />{t('calendar.google')}</label>
    {error && <p role="alert">{t(error)}</p>}
    <div className="action-row">
      {!saved && <button type="submit" disabled={busy}>{t(busy ? 'app.loading' : 'common.save')}</button>}
      <button type="button" onClick={onClose} disabled={busy}>{t(saved ? 'app.close' : 'common.cancel')}</button>
    </div>
  </form>;
}
