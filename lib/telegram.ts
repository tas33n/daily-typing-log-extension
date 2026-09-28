import { deleteEntries, getEntries } from './db';
import { toTxt } from './format';
import { getTelegramConfig } from './telegram-crypto';
import type { LogEntry } from './types';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
/** Keep documents safely below Telegram's 50 MB upload limit. */
const MAX_DOCUMENT_CHARS = 40_000_000;
const DEFAULT_INTERVAL_MINUTES = 60;

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export type SendResult =
  | { ok: true; sent: number; reason?: 'no-entries' }
  | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Accepts `30m`, `30min`, `1h`, `2 hours`, `1d`, `7 days` or plain minutes. */
export function parseIntervalMinutes(raw: string | undefined): number {
  if (!raw) return DEFAULT_INTERVAL_MINUTES;

  const match = raw.trim().match(/^(\d+)\s*(min|m|hours?|hrs?|h|days?|d)?$/i);
  if (!match) return DEFAULT_INTERVAL_MINUTES;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return DEFAULT_INTERVAL_MINUTES;

  const unit = (match[2] ?? 'm').toLowerCase();
  const minutesPerUnit = unit.startsWith('d') ? 1440 : unit.startsWith('h') ? 60 : 1;

  // Chrome/Firefox reject alarm periods below 1 minute.
  return Math.max(1, Math.round(amount * minutesPerUnit));
}

export function getSendIntervalMinutes(): number {
  return parseIntervalMinutes(import.meta.env.TELEGRAM_SEND_INTERVAL);
}

let inFlight: Promise<SendResult> | undefined;

/**
 * Uploads every stored log entry to Telegram as a `.txt` document and clears
 * the entries that were delivered. Concurrent calls share the same run.
 */
export function sendLogsToTelegram(): Promise<SendResult> {
  if (!inFlight) {
    inFlight = uploadPendingLogs().finally(() => {
      inFlight = undefined;
    });
  }
  return inFlight;
}

async function uploadPendingLogs(): Promise<SendResult> {
  const config = await getTelegramConfig();
  if (!config) {
    return {
      ok: false,
      error:
        'Telegram is not configured. Fill TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.'
    };
  }

  let entries: LogEntry[];
  try {
    entries = await getEntries();
  } catch (error) {
    return { ok: false, error: `Could not read local logs: ${errorMessage(error)}` };
  }

  if (!entries.length) return { ok: true, sent: 0, reason: 'no-entries' };

  // Oldest first, so each document covers a continuous time range.
  entries.sort((a, b) => a.timestamp - b.timestamp);

  let sent = 0;
  for (const chunk of chunkEntries(entries)) {
    try {
      await postLogDocument(config, chunk);
    } catch (error) {
      return {
        ok: false,
        error: `Upload failed after ${sent} session(s): ${errorMessage(error)}`
      };
    }

    // Only clear what was actually delivered, never logs written while sending.
    try {
      await deleteEntries(chunk.map((entry) => entry.id));
    } catch (error) {
      return {
        ok: false,
        error: `Uploaded ${sent + chunk.length} session(s) but could not clear local logs: ${errorMessage(error)}`
      };
    }

    sent += chunk.length;
  }

  return { ok: true, sent };
}

/** Split large payloads into several documents so uploads keep working. */
function chunkEntries(entries: LogEntry[]): LogEntry[][] {
  const chunks: LogEntry[][] = [];
  let current: LogEntry[] = [];
  let size = 0;

  for (const entry of entries) {
    const entrySize = entry.text.length + entry.url.length + 64;
    if (current.length && size + entrySize > MAX_DOCUMENT_CHARS) {
      chunks.push(current);
      current = [];
      size = 0;
    }

    current.push(entry);
    size += entrySize;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

async function postLogDocument(config: TelegramConfig, entries: LogEntry[]): Promise<void> {
  const form = new FormData();
  form.append('chat_id', config.chatId);
  form.append('caption', `Daily Typing Log · ${entries.length} session(s)`);
  form.append(
    'document',
    new Blob([toTxt(entries)], { type: 'text/plain' }),
    buildFileName(entries)
  );

  const url = `${TELEGRAM_API_BASE}/bot${config.token}/sendDocument`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form });
  } catch (error) {
    throw new Error(`network error: ${errorMessage(error)}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      `Telegram API responded ${response.status} ${payload?.description ?? response.statusText}`
    );
  }
}

function buildFileName(entries: LogEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]?.date ?? 'log';
  const last = sorted[sorted.length - 1]?.date ?? first;
  const range = first === last ? first : `${first}_to_${last}`;
  return `typing-log-${range}.txt`;
}