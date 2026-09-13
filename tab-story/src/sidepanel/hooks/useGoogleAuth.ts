export async function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const token = typeof result === 'string' ? result : result?.token;
        if (token) resolve(token);
        else reject(new Error('No auth token received'));
      }
    });
  });
}

export async function createCalendarEvent(token: string, event: {
  title: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
}): Promise<void> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        start: { dateTime: event.startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end: { dateTime: event.endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      }),
    }
  );
  if (!response.ok) throw new Error('Failed to create calendar event');
}

export async function backupToGoogleDrive(token: string, data: object): Promise<void> {
  const fileName = 'tabstory-backup.json';
  const fileContent = JSON.stringify(data);

  // Check if backup file already exists
  const listRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name=' + "'" + fileName + "'",
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!listRes.ok) throw new Error('Failed to list backup files');
  const listData = await listRes.json();
  const existingFile = listData.files?.[0];

  if (existingFile) {
    // Update existing file
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files/' + existingFile.id + '?uploadType=media',
      {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: fileContent,
      }
    );
    if (!response.ok) throw new Error('Failed to update backup');
  } else {
    // Create new file
    const metadata = { name: fileName, parents: ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: form,
      }
    );
    if (!response.ok) throw new Error('Failed to create backup');
  }
}
