import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SavedTab } from '../db';
import { useI18n } from '../../i18n/useI18n';
import { getWeekInfo } from '../../i18n/core';
import { cancelTabReminder, completeTabReminder, snoozeTabReminder } from '../../reminders/service';
import { ScheduleEditor } from './ScheduleEditor';

export function CalendarPanel() {
  const { t, locale, dir, formatDate, formatNumber } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date());
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState<SavedTab | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tabs = useLiveQuery(() => db.tabs.toArray());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const active = (tabs || []).filter(tab => !tab.deletedAt);
  const timestamp = (tab: SavedTab) => tab.scheduledAt || tab.completedScheduledAt || 0;
  const scheduled = active.filter(tab => timestamp(tab) > 0).sort((a, b) => timestamp(a) - timestamp(b));
  const forDay = scheduled.filter(tab => new Date(timestamp(tab)).toDateString() === selected.toDateString());
  const overdue = scheduled.filter(tab => !tab.completedAt && tab.scheduledAt! < now - 60000);
  const firstDay = getWeekInfo(locale).firstDay % 7;
  const offset = (month.getDay() - firstDay + 7) % 7;
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + dayCount) / 7) * 7 }, (_, i) => i >= offset && i < offset + dayCount ? i - offset + 1 : null);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (cause) { console.error('[Tab Story] Calendar', cause); setError(cause instanceof Error && cause.message.startsWith('errors.') ? cause.message : 'app.operationFailed'); }
    finally { setBusy(false); }
  }
  const status = (tab: SavedTab) => tab.completedAt ? 'completed' : tab.scheduledAt! > now ? 'upcoming' : tab.scheduledAt! >= now - 60000 ? 'due' : 'overdue';
  function card(tab: SavedTab) {
    return <article key={tab.id} className="calendar-task">
      <button className="resource-link" onClick={() => action(async () => { await chrome.tabs.create({ url: tab.url }); })}>{tab.title}</button>
      <div className="action-row"><time dateTime={new Date(timestamp(tab)).toISOString()}>{formatDate(timestamp(tab), { dateStyle: 'medium', timeStyle: 'short' })}</time><strong>{t('calendar.' + status(tab))}</strong></div>
      <div className="action-row">
        {!tab.completedAt && <button disabled={busy} onClick={() => action(() => completeTabReminder(tab.id!))}>{t('calendar.complete')}</button>}
        <button disabled={busy} onClick={() => { setEditing(tab); setChoosing(false); }}>{t('calendar.reschedule')}</button>
        {!tab.completedAt && tab.scheduledAt! <= now && <button disabled={busy} onClick={() => action(() => snoozeTabReminder(tab.id!))}>{t('calendar.snooze')}</button>}
        <button disabled={busy} onClick={() => action(() => cancelTabReminder(tab.id!))}>{t('calendar.clear')}</button>
      </div>
    </article>;
  }
  return <section className="calendar-panel">
    {error && <p role="alert">{t(error)}</p>}
    <div className="calendar-card">
      <div className="action-row calendar-heading">
        <strong aria-live="polite">{formatDate(month, { month: 'long', year: 'numeric' })}</strong>
        <button onClick={() => { const date = new Date(); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setSelected(date); }}>{t('common.today')}</button>
        <button aria-label={t('calendar.previous')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>{dir === 'rtl' ? '›' : '‹'}</button>
        <button aria-label={t('calendar.next')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>{dir === 'rtl' ? '‹' : '›'}</button>
      </div>
      <table className="calendar-grid" aria-label={formatDate(month, { month: 'long', year: 'numeric' })}>
        <thead><tr>{Array.from({ length: 7 }, (_, i) => <th key={i} scope="col" title={formatDate(new Date(2026, 5, 7 + (firstDay + i) % 7), { weekday: 'long' })}>{formatDate(new Date(2026, 5, 7 + (firstDay + i) % 7), { weekday: 'narrow' })}</th>)}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, row) => <tr key={row}>{cells.slice(row * 7, row * 7 + 7).map((day, col) => {
          const date = day ? new Date(month.getFullYear(), month.getMonth(), day) : null;
          const hasTasks = date && scheduled.some(tab => new Date(timestamp(tab)).toDateString() === date.toDateString());
          return <td key={col}>{date && <button aria-label={formatDate(date, { dateStyle: 'full' })} aria-pressed={date.toDateString() === selected.toDateString()} aria-current={date.toDateString() === new Date(now).toDateString() ? 'date' : undefined} onClick={() => { setSelected(date); setEditing(null); }} onKeyDown={event => {
            const delta = event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowRight' ? (dir === 'rtl' ? -1 : 1) : event.key === 'ArrowLeft' ? (dir === 'rtl' ? 1 : -1) : 0;
            if (!delta) return;
            event.preventDefault(); const next = new Date(date); next.setDate(next.getDate() + delta); setSelected(next); setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.calendar-grid button[aria-pressed="true"]')?.focus());
          }}>{formatNumber(day!)}{hasTasks && <span aria-label={t('calendar.schedule')} className="calendar-dot">•</span>}</button>}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
    <div className="action-row"><h3>{formatDate(selected, { dateStyle: 'full' })}</h3><button onClick={() => { setChoosing(!choosing); setEditing(null); }}>{t('calendar.schedule')}</button></div>
    {choosing && <div className="calendar-card"><label htmlFor="calendar-tab">{t('calendar.selectTab')}</label><select id="calendar-tab" value="" onChange={event => { setEditing(active.find(tab => tab.id === Number(event.target.value)) || null); setChoosing(false); }}><option value="">{t('calendar.selectTab')}</option>{active.map(tab => <option key={tab.id} value={tab.id}>{tab.title}</option>)}</select>{active.length === 0 && <p>{t('calendar.noTabs')}</p>}</div>}
    {editing && <ScheduleEditor key={editing.id + '-' + selected.getTime()} tab={editing} initialDate={editing.scheduledAt ? undefined : selected} onClose={() => setEditing(null)} />}
    {forDay.length ? forDay.map(card) : <p>{t('calendar.empty')}</p>}
    {overdue.some(tab => !forDay.includes(tab)) && <section><h3>{t('calendar.overdue')}</h3>{overdue.filter(tab => !forDay.includes(tab)).map(card)}</section>}
  </section>;
}
