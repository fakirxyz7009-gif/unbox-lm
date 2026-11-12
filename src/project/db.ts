/**
 * The app's local database (IndexedDB, per origin). Everything the studio keeps between sessions
 * lives here, inside the app: projects and their versions, recorded / imported audio, the user
 * sample library, presets, reference tracks, video and settings.
 */

export const DB_NAME = 'unbox-studio';
const DB_VERSION = 2;

export type StoreName = 'projects' | 'versions' | 'audio' | 'samples' | 'presets' | 'media' | 'settings' | 'recordingJournal';
const STORES: { name: StoreName; key: string; indexes?: string[] }[] = [
  { name: 'projects', key: 'id', indexes: ['updatedAt'] },
  { name: 'versions', key: 'id', indexes: ['projectId'] },
  { name: 'audio', key: 'id' },
  { name: 'samples', key: 'id' },
  { name: 'presets', key: 'id', indexes: ['deviceType'] },
  { name: 'media', key: 'id' },
  { name: 'settings', key: 'key' },
  { name: 'recordingJournal', key: 'id', indexes: ['sessionId'] },
];

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    req.onblocked = () => {
      blocked = true;
      reject(new Error('Close other Unbox Studio tabs or windows, then reopen this window to upgrade project storage.'));
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (db.objectStoreNames.contains(s.name)) continue;
        const os = db.createObjectStore(s.name, { keyPath: s.key });
        s.indexes?.forEach((i) => os.createIndex(i, i));
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        if (opening === attempt) opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Database could not be opened'));
  });
  opening = attempt;
  void attempt.catch(() => { if (opening === attempt) opening = null; });
  return attempt;
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

/** Resolves once the transaction has committed, so a write that reports success is on disk. */
const committed = (tx: IDBTransaction, req: IDBRequest) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(req.error ?? tx.error ?? new Error('Database write failed'));
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error('Database write was aborted'));
  });

export async function dbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  await committed(tx, tx.objectStore(store).put(value));
}

/** Writes a bounded batch in one transaction (used for non-realtime recovery journaling). */
export async function dbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  let last: IDBRequest | null = null;
  values.forEach((value) => { last = os.put(value); });
  await committed(tx, last!);
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  await committed(tx, tx.objectStore(store).delete(key));
}

export async function dbDeleteMany(store: StoreName, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  let last: IDBRequest | null = null;
  keys.forEach((key) => { last = os.delete(key); });
  await committed(tx, last!);
}

export async function dbAll<T>(store: StoreName, range?: IDBKeyRange): Promise<T[]> {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).getAll(range)) as Promise<T[]>;
}

export async function dbKeys(store: StoreName): Promise<string[]> {
  const db = await openDb();
  return (await done(db.transaction(store).objectStore(store).getAllKeys())).map(String);
}

export async function dbByIndex<T>(store: StoreName, index: string, value: string): Promise<T[]> {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).index(index).getAll(value)) as Promise<T[]>;
}

export async function dbKeysByIndex(store: StoreName, index: string, value: string): Promise<string[]> {
  const db = await openDb();
  const keys = await done(db.transaction(store).objectStore(store).index(index).getAllKeys(value));
  return keys.filter((key): key is string => typeof key === 'string');
}

/** Estimated storage use (bytes) and quota, when the browser reports it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

/** Asks the browser not to evict the database under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
