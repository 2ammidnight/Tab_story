import { Readability } from '@mozilla/readability';
export interface Source {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
  image?: string;
  images?: string[];
  domain?: string;
  method?: string;
  fetchedAt?: number;
}
export class AIRequestError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
  }
}
export async function aiRequest(operation: string, data: Record<string, unknown> = {}) {
  const result = await chrome.runtime.sendMessage({ type: 'tab-story:ai', operation, ...data });
  if (!result?.ok) throw new AIRequestError(result?.error || 'AI service unavailable. Reload the extension.', result?.code);
  return result;
}


export function parseArticle(snapshot: { html: string; url: string; fetchedAt: number }): Source {
  const doc = new DOMParser().parseFromString(snapshot.html, 'text/html');
  const base = doc.createElement('base');
  base.href = snapshot.url;
  doc.head.prepend(base);
  const imageUrl = (value: string | null) => {
    try {
      const url = new URL(value || '', snapshot.url);
      return value && /^https?:$/.test(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const og = imageUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null);
  const article = new Readability(doc.cloneNode(true) as Document).parse();
  // Conversation apps are not articles; preserve their actual message bodies.
  const messages = Array.from(doc.querySelectorAll('[data-message-author-role]'));
  const main = doc.querySelector('main, [role="main"]')?.cloneNode(true) as HTMLElement | undefined;
  main?.querySelectorAll('nav,aside,footer,form,button,input,textarea,select,[role="navigation"]').forEach(node => node.remove());
  const messageText = messages.map(node => `${node.getAttribute('data-message-author-role')}:\n${node.textContent?.trim() || ''}`).join('\n\n');
  const fallbackText = main?.textContent?.trim() || '';
  const articleText = article?.textContent?.trim() || '';
  const extractedText = messageText || (articleText.length >= 80 ? articleText : fallbackText);
  if (extractedText.length < 80) {
    throw new Error(`“${doc.title || 'Selected tab'}” has no loaded article or conversation to summarize. Open the saved page, let its content load, and retry. For ChatGPT, select a saved conversation URL rather than the empty home page.`);
  }
  const content = new DOMParser().parseFromString(article?.content || main?.outerHTML || '', 'text/html');
  const images = Array.from(content.images).map((img, index) => {
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    const srcsetCandidates = srcset.split(',').map(candidate => {
      const [url, descriptor = '0w'] = candidate.trim().split(/\s+/);
      return { url, width: Number.parseInt(descriptor, 10) || 0 };
    }).filter(candidate => candidate.url).sort((a, b) => b.width - a.width);
    return {
      url: imageUrl(
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        srcsetCandidates[0]?.url
      ),
      area: (Number(img.getAttribute('width')) || 0) * (Number(img.getAttribute('height')) || 0),
      index,
    };
  }).filter(img => img.url);
  images.sort((a, b) => b.area - a.area || a.index - b.index);
  content.querySelectorAll('p,li,h1,h2,h3,tr,pre').forEach(node => node.append('\n'));
  return {
    title: article?.title || doc.title, url: snapshot.url,
    text: messageText || (articleText.length >= 80 ? content.body.textContent?.trim() || articleText : fallbackText),
    image: og || images[0]?.url || '', images: images.map(img => img.url),
    domain: new URL(snapshot.url).hostname, truncated: false,
    method: messages.length ? 'Selected conversation' : 'Readability · selected tab', fetchedAt: snapshot.fetchedAt,
  };
}
