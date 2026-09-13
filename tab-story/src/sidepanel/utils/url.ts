export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function getFavicon(faviconUrl: string | undefined, domain: string): string {
  if (faviconUrl && faviconUrl.startsWith('http')) return faviconUrl;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function getFaviconForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isInternalUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:')
  );
}
