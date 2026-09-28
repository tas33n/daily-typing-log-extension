import type { LogEntry } from './types';

const DB_NAME = 'daily-typing-log';
const DB_VERSION = 2;
const STORE_NAME = 'entries';

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      } else {
        store = request.transaction!.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function normalizeEntry(raw: any): LogEntry {
  const timestamp = raw.timestamp ?? raw.startTimestamp ?? raw.endTimestamp ?? Date.now();
  return {
    id: raw.id,
    date: raw.date,
    time: raw.time ?? raw.startTime ?? raw.endTime ?? '',
    timestamp,
    url: raw.url ?? '',
    text: raw.text ?? ''
  };
}

export async function upsertEntry(entry: LogEntry): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getEntries(date?: string, limit?: number): Promise<LogEntry[]> {
  const db = await openDb();

  const entries = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = date
      ? store.index('date').getAll(IDBKeyRange.only(date))
      : store.getAll();

    request.onsuccess = () => resolve(request.result as any[]);
    request.onerror = () => reject(request.error);
  });

  const normalized = entries.map(normalizeEntry);
  normalized.sort((a, b) => b.timestamp - a.timestamp);
  return typeof limit === 'number' ? normalized.slice(0, limit) : normalized;
}

export async function deleteDate(date: string): Promise<void> {
  const db = await openDb();
  const entries = await getEntries(date);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const entry of entries) store.delete(entry.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteEntries(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
