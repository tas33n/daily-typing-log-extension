import { browser } from 'wxt/browser';
import type { LogEntry, FieldInfo } from '../lib/types';

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type Session = {
  id: string;
  element: Editable;
  startedAt: number;
  lastChangedAt: number;
  timer?: number;
  fieldInfo?: FieldInfo;
};

const sessions = new Map<Editable, Session>();
const SAVE_DELAY_MS = 1500;

// Input types that are NOT text entry (checkboxes, buttons, sliders, etc.)
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'image', 'color', 'range'
]);

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

  // Skip disabled/readonly fields
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.disabled || target.readOnly) return false;
    // Skip non-text input types
    if (NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase())) return false;
  }

  // Textarea, text-like inputs, and contenteditable elements
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase())) ||
    target.isContentEditable
  );
}

function readText(el: Editable): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText || el.textContent || '';
}

function getFieldInfo(el: Editable): FieldInfo {
  const info: FieldInfo = {
    label: '',
    type: '',
    isPassword: false
  };

  if (el instanceof HTMLInputElement) {
    info.type = el.type.toLowerCase();
    info.isPassword = el.type.toLowerCase() === 'password';
    info.name = el.name || undefined;
    info.placeholder = el.placeholder || undefined;
    info.id = el.id || undefined;

    // Priority: label > name > placeholder > type
    // 1. Try to find associated label
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      if (labelEl?.textContent?.trim()) {
        info.label = labelEl.textContent.trim();
      }
    }
    // 2. Check parent label
    if (!info.label) {
      const parentLabel = el.closest('label');
      if (parentLabel?.textContent?.trim()) {
        // Get just the label text, not the input value
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        const inputInClone = clone.querySelector('input, textarea, select');
        if (inputInClone) inputInClone.remove();
        const labelText = clone.textContent?.trim();
        if (labelText) info.label = labelText;
      }
    }
    // 3. Check aria-label / aria-labelledby
    if (!info.label) {
      if (el.getAttribute('aria-label')?.trim()) {
        info.label = el.getAttribute('aria-label')!.trim();
      } else if (el.getAttribute('aria-labelledby')) {
        const labelledBy = document.getElementById(el.getAttribute('aria-labelledby')!);
        if (labelledBy?.textContent?.trim()) {
          info.label = labelledBy.textContent.trim();
        }
      }
    }
    // 4. Fallback to name attribute
    if (!info.label && el.name?.trim()) {
      info.label = el.name.trim();
    }
    // 5. Fallback to placeholder
    if (!info.label && el.placeholder?.trim()) {
      info.label = el.placeholder.trim();
    }
    // 6. Final fallback to type
    if (!info.label) {
      info.label = info.type || 'input';
    }
  } else if (el instanceof HTMLTextAreaElement) {
    info.type = 'textarea';
    info.name = el.name || undefined;
    info.placeholder = el.placeholder || undefined;
    info.id = el.id || undefined;

    if (el.id) {
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      if (labelEl?.textContent?.trim()) {
        info.label = labelEl.textContent.trim();
      }
    }
    if (!info.label) {
      const parentLabel = el.closest('label');
      if (parentLabel?.textContent?.trim()) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        const textareaInClone = clone.querySelector('textarea');
        if (textareaInClone) textareaInClone.remove();
        const labelText = clone.textContent?.trim();
        if (labelText) info.label = labelText;
      }
    }
    if (!info.label && el.getAttribute('aria-label')?.trim()) {
      info.label = el.getAttribute('aria-label')!.trim();
    }
    if (!info.label && el.name?.trim()) {
      info.label = el.name.trim();
    }
    if (!info.label && el.placeholder?.trim()) {
      info.label = el.placeholder.trim();
    }
    if (!info.label) {
      info.label = 'textarea';
    }
  } else {
    // contenteditable
    info.type = 'contenteditable';
    info.isPassword = false;
    info.id = el.id || undefined;

    // Try to find a label-like element nearby
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel?.trim()) {
      info.label = ariaLabel.trim();
    } else if (el.id) {
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      if (labelEl?.textContent?.trim()) {
        info.label = labelEl.textContent.trim();
      }
    }
    if (!info.label) {
      // Look for preceding sibling or parent text that might be a label
      const prev = el.previousElementSibling;
      if (prev?.textContent?.trim() && prev.tagName !== 'SCRIPT' && prev.tagName !== 'STYLE') {
        info.label = prev.textContent.trim().slice(0, 100);
      }
    }
    if (!info.label) {
      info.label = 'contenteditable';
    }
  }

  return info;
}

function getOrCreateSession(el: Editable, now: number): Session {
  const existing = sessions.get(el);
  if (existing) return existing;

  const session: Session = {
    id: crypto.randomUUID(),
    element: el,
    startedAt: now,
    lastChangedAt: now,
    fieldInfo: getFieldInfo(el)
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

  // Get field info if not already cached
  const fieldInfo = session.fieldInfo ?? getFieldInfo(el);

  const entry: LogEntry = {
    id: session.id,
    date: localDate(session.startedAt),
    time: localTime(session.startedAt),
    timestamp: session.startedAt,
    url: location.href,
    text,
    field: fieldInfo
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
