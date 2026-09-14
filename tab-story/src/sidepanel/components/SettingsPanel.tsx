import { useEffect, useState } from 'react';
import { AISettingsCard } from './AISettingsCard';
import { testReminderNotification } from '../../reminders/service';
import { useI18n } from '../../i18n/useI18n';
import { BellIcon } from '@heroicons/react/24/outline';

function GoogleIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z"/>
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.9-3.6-11.5-8.4H5.7v5.2A20.4 20.4 0 0 0 24 44Z"/>
    <path fill="#FBBC05" d="M12.5 27.6a12.2 12.2 0 0 1 0-7.2v-5.2H5.7a20 20 0 0 0 0 17.6Z"/>
    <path fill="#EA4335" d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15.2l6.8 5.2C14.1 15.6 18.7 12 24 12Z"/>
  </svg>;
}

export function SettingsPanel() {
  const { t } = useI18n();
  const [notificationMessage, setNotificationMessage] = useState('');
  const [testingNotification, setTestingNotification] = useState(false);
  const [websiteAlerts, setWebsiteAlerts] = useState(false);
  const [desktopPermission, setDesktopPermission] = useState('Checking…');
  const [permissionBusy, setPermissionBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] })
        .then(value => { if (active) setWebsiteAlerts(value); }).catch(() => {});
      void chrome.notifications.getPermissionLevel()
        .then(value => { if (active) setDesktopPermission(value === 'granted' ? 'Chrome allowed' : 'Blocked in Chrome'); })
        .catch(() => { if (active) setDesktopPermission('Unavailable'); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      chrome.permissions.onAdded.removeListener(refresh);
      chrome.permissions.onRemoved.removeListener(refresh);
    };
  }, []);
  async function testNotification() {
    setTestingNotification(true);
    try {
      await testReminderNotification();
      setNotificationMessage('Sent to Chrome. Did a desktop alert appear?');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'reminderUnavailable';
      setNotificationMessage(t(`errors.${code}`));
    } finally { setTestingNotification(false); }
  }
  const [state, setState] = useState<{ connected?: boolean; daily?: boolean; lastBackup?: number; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<{ id: string; createdTime: string }[]>([]);
  async function call(operation: string, id?: string) {
    const result = await chrome.runtime.sendMessage({ type: 'tab-story:backup', operation, id });
    if (!result?.ok) throw new Error(result?.error || 'Account service unavailable.');
    return result;
  }
  useEffect(() => {
    void call('status').then(setState).catch(error => setMessage(error.message));
    const listener = () => { void call('status').then(setState).catch(() => {}); };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  async function run(operation: string, id?: string) {
    setBusy(true); setMessage('');
    try {
      const result = await call(operation, id);
      if (operation === 'list') { setFiles(result.files); if (!result.files.length) setMessage('No backups found in this Google account.'); }
      else { setState(result); setMessage(operation === 'restore' ? 'Restored. Reopen the side panel to refresh all preferences.' : 'Saved.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation failed.'); }
    finally { setBusy(false); }
  }
  const button = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-color)', cursor: 'pointer' };
  return <div className="account-settings" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0, width: '100%', gap: 12, color: 'var(--text-color)', fontSize: 12 }}>
    <details style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>AI assistant</summary>
      <div style={{ marginTop: 12 }}><AISettingsCard compact /></div>
    </details>
    <section style={{ display: 'grid', gap: 12, padding: 14, border: '1px solid var(--border-color)', borderRadius: 12 }}>
      <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BellIcon aria-hidden="true" style={{ width: 20, height: 20 }} />Reminders</strong>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Desktop alerts</span><span>{desktopPermission}</span></div>
      <button style={button} disabled={permissionBusy || websiteAlerts} onClick={() => {
        setPermissionBusy(true);
        void chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] }).then(granted => {
          setWebsiteAlerts(granted);
          setNotificationMessage(granted ? 'Website banners enabled.' : 'Desktop alerts still work without website access.');
        }).catch(() => setNotificationMessage('Website permission failed. Try again.')).finally(() => setPermissionBusy(false));
      }}>{websiteAlerts ? '✓ Website banners enabled' : permissionBusy ? 'Enabling…' : 'Enable website banners'}</button>
      <button style={button} disabled={testingNotification} onClick={() => void testNotification()}>{testingNotification ? 'Sending…' : 'Preview desktop alert'}</button>
      {notificationMessage && <p role="status" style={{ margin: 0, lineHeight: 1.5 }}>{notificationMessage}</p>}
      <small>Keep Chrome running. No account needed.</small>
      <details><summary style={{ cursor: 'pointer' }}>No alert?</summary>
        <p>Mac: System Settings → Notifications → enable Google Chrome and Google Chrome Helper (Alerts).</p>
        <p>Windows: Settings → System → Notifications → enable Google Chrome.</p>
        <p>Allow sound and banners; check Focus / Do Not Disturb. Chrome cannot read these system settings. Website banners cannot appear on chrome:// pages.</p>
      </details>
    </section>
    <section style={{ display: 'grid', gap: 12, padding: 14, border: '1px solid var(--border-color)', borderRadius: 12 }}>
      <strong>Account &amp; backup</strong>
      <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--placeholder-color)' }}>Optional: upload saved tabs, URLs, notes, schedules, and settings to your Google Drive. API keys are excluded.</p>
      {state.connected && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><GoogleIcon />Connected</span>}
      {!state.connected ? <button style={{ ...button, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={busy} onClick={() => void run('connect')}><GoogleIcon />Connect with Google</button> : <>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={!!state.daily} disabled={busy} onChange={event => void run(event.target.checked ? 'enable' : 'disable')} />
          Daily backup
        </label>
        {state.lastBackup && <small>Last backup: {new Date(state.lastBackup).toLocaleString()}</small>}
        <button style={button} disabled={busy} onClick={() => void run('backup')}>Back up now</button>
        <button style={button} disabled={busy} onClick={() => void run('list')}>Restore backup</button>
        {files.map(file => <button key={file.id} style={button} disabled={busy} onClick={() => {
          if (window.confirm('Replace local data and preferences with this backup? A local recovery copy of the current data will be kept.')) void run('restore', file.id);
        }}>Restore {new Date(file.createdTime).toLocaleString()}</button>)}
        <button style={button} disabled={busy} onClick={() => { setFiles([]); void run('disconnect'); }}>Disconnect</button>
      </>}
      <details><summary style={{ cursor: 'pointer' }}>Backup details</summary><p>Runs when Chrome is open. Reinstall? Connect the same account to restore. API keys are excluded.</p></details>
      {(message || state.error) && <p role="status" style={{ margin: 0 }}>{message || state.error}</p>}
      {busy && <span role="status">Working…</span>}
    </section>
  </div>;
}
