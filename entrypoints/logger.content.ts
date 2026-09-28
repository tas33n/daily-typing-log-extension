import { browser } from 'wxt/browser';
import type { LogEntry } from '../lib/types';

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type Session = {
  id: string;
  element: Editable;
  startedAt: number;
  lastChangedAt: number;
  timer?: number;
};

const sessions = new Map<Editable, Session>();
const SAVE_DELAY_MS = 1500;

function localDate(ts = Date.now()): string {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTime(ts = Date.now()): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function isEditable(target: EventTarget | null): target is Editable {
  if (!(target instanceof HTMLElement)) return false;

  if (target instanceof HTMLTextAreaElement) return !target.disabled && !target.readOnly;

  if (target instanceof HTMLInputElement) {
    const allowed = new Set(['text', 'search', 'email', 'url', 'tel']);
    return allowed.has(target.type.toLowerCase()) && !target.disabled && !target.readOnly;
  }

  return target.isContentEditable;
}

function readText(el: Editable): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText || el.textContent || '';
}

function getOrCreateSession(el: Editable, now: number): Session {
  const existing = sessions.get(el);
  if (existing) return existing;

  const session: Session = {
    id: crypto.randomUUID(),
    element: el,
    startedAt: now,
    lastChangedAt: now
  };
  sessions.set(el, session);
  return session;
}

async function saveSession(session: Session): Promise<void> {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = undefined;
  }

  const el = session.element;
  if (!document.contains(el)) {
    sessions.delete(el);
    return;
  }

  const text = readText(el).trim();
  if (!text) return;

  const entry: LogEntry = {
    id: session.id,
    date: localDate(session.startedAt),
    time: localTime(session.startedAt),
    timestamp: session.startedAt,
    url: location.href,
    text
  };

  try {
    await browser.runtime.sendMessage({ type: 'UPSERT_LOG', entry });
  } catch {
    // Extension context can disappear during reload/update. Ignore and continue.
  }
}

function scheduleSave(session: Session): void {
  if (session.timer) clearTimeout(session.timer);
  session.timer = window.setTimeout(() => void saveSession(session), SAVE_DELAY_MS);
}

function onInput(event: Event): void {
  if (!isEditable(event.target)) return;
  const el = event.target;

  const now = Date.now();
  const session = getOrCreateSession(el, now);
  session.lastChangedAt = now;
  scheduleSave(session);
}

function onFocusOut(event: FocusEvent): void {
  if (!isEditable(event.target)) return;
  const session = sessions.get(event.target);
  if (!session) return;

  session.lastChangedAt = Date.now();
  void saveSession(session);
  sessions.delete(event.target);
}

function flushSessions(): void {
  for (const session of sessions.values()) {
    session.lastChangedAt = Date.now();
    void saveSession(session);
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main(ctx) {
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusout', onFocusOut, true);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushSessions();
    };
    document.addEventListener('visibilitychange', onVisibility, true);
    window.addEventListener('pagehide', flushSessions, true);

    ctx.onInvalidated(() => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('visibilitychange', onVisibility, true);
      window.removeEventListener('pagehide', flushSessions, true);
      for (const session of sessions.values()) {
        if (session.timer) clearTimeout(session.timer);
      }
      sessions.clear();
    });
  }
});
