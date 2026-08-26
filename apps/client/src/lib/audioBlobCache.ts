const DB_NAME = "chorus-audio-cache";
const STORE_NAME = "audio-blobs";
// Metadata lives in its own store so pruning never has to deserialize the
// (potentially huge) audio ArrayBuffers just to decide what to evict.
const META_STORE_NAME = "blob-meta";
const DB_VERSION = 2;
const MAX_ENTRIES = 80;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // ~500MB budget across all cached tracks

type AudioBlobEntry = {
  url: string;
  data: ArrayBuffer;
};

type AudioBlobMetaEntry = {
  url: string;
  updatedAt: number;
  byteLength: number;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionToPromise = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const openCacheDb = async (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return null;

  try {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;

      // v1 kept updatedAt/byteLength inline on each blob record; v2 moves
      // them to their own store so pruning never has to deserialize audio
      // data. A v1 database's blobs have no matching blob-meta rows, which
      // would make them permanently invisible to pruneCache (it only reads
      // blob-meta) — the eviction budget would leak forever. This is a pure
      // cache, so drop and recreate rather than backfill: backfilling would
      // mean reading every blob's data just to compute byteLength, which
      // reintroduces the exact memory problem this migration exists to fix.
      if (event.oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        const metaStore = db.createObjectStore(META_STORE_NAME, {
          keyPath: "url",
        });
        metaStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      // Another tab has this DB open on an older version and hasn't
      // released it (e.g. a tab still running pre-v2 code). Without this,
      // the open request never settles and every cache read/write on this
      // tab hangs forever instead of falling back to a normal fetch.
      request.onblocked = () => resolve(null);
    });
    // Let another tab's version-bump proceed instead of blocking it the
    // same way: close this connection as soon as one is requested.
    db?.addEventListener("versionchange", () => db.close());
    return db;
  } catch (error) {
    console.warn("IndexedDB unavailable for audio cache", error);
    return null;
  }
};

// Metadata records are tiny (a url + two numbers), so reading all of them
// to decide what to evict is cheap — unlike reading every cached audio
// buffer, which is what the old getAll()-on-the-blob-store approach did.
const pruneCache = async (db: IDBDatabase): Promise<void> => {
  const metaTx = db.transaction(META_STORE_NAME, "readonly");
  const metaEntries = (await requestToPromise(
    metaTx.objectStore(META_STORE_NAME).getAll()
  )) as AudioBlobMetaEntry[];
  await transactionToPromise(metaTx);

  const totalBytes = metaEntries.reduce((sum, e) => sum + e.byteLength, 0);
  if (metaEntries.length <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) {
    return;
  }

  const oldestFirst = [...metaEntries].sort(
    (a, b) => a.updatedAt - b.updatedAt
  );

  const toEvict: string[] = [];
  let remainingCount = metaEntries.length;
  let remainingBytes = totalBytes;
  for (const entry of oldestFirst) {
    if (remainingCount <= MAX_ENTRIES && remainingBytes <= MAX_TOTAL_BYTES) {
      break;
    }
    toEvict.push(entry.url);
    remainingCount -= 1;
    remainingBytes -= entry.byteLength;
  }

  if (toEvict.length === 0) return;

  const tx = db.transaction([STORE_NAME, META_STORE_NAME], "readwrite");
  const blobStore = tx.objectStore(STORE_NAME);
  const metaStore = tx.objectStore(META_STORE_NAME);
  for (const url of toEvict) {
    blobStore.delete(url);
    metaStore.delete(url);
  }
  await transactionToPromise(tx);
};

export const getCachedAudioBuffer = async (
  url: string
): Promise<ArrayBuffer | null> => {
  const db = await openCacheDb();
  if (!db) return null;

  try {
    const tx = db.transaction([STORE_NAME, META_STORE_NAME], "readwrite");
    const blobStore = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(META_STORE_NAME);
    const entry = (await requestToPromise(
      blobStore.get(url)
    )) as AudioBlobEntry | undefined;

    if (!entry?.data) {
      await transactionToPromise(tx);
      return null;
    }

    metaStore.put({
      url,
      updatedAt: Date.now(),
      byteLength: entry.data.byteLength,
    } satisfies AudioBlobMetaEntry);
    await transactionToPromise(tx);
    return entry.data.slice(0);
  } catch (error) {
    console.warn("Failed reading audio cache", error);
    return null;
  }
};

export const putCachedAudioBuffer = async (
  url: string,
  arrayBuffer: ArrayBuffer
): Promise<void> => {
  const db = await openCacheDb();
  if (!db) return;

  try {
    const tx = db.transaction([STORE_NAME, META_STORE_NAME], "readwrite");
    tx.objectStore(STORE_NAME).put({
      url,
      data: arrayBuffer.slice(0),
    } satisfies AudioBlobEntry);
    tx.objectStore(META_STORE_NAME).put({
      url,
      updatedAt: Date.now(),
      byteLength: arrayBuffer.byteLength,
    } satisfies AudioBlobMetaEntry);
    await transactionToPromise(tx);
    await pruneCache(db);
  } catch (error) {
    console.warn("Failed writing audio cache", error);
  }
};

export const removeCachedAudioBuffer = async (url: string): Promise<void> => {
  const db = await openCacheDb();
  if (!db) return;

  try {
    const tx = db.transaction([STORE_NAME, META_STORE_NAME], "readwrite");
    tx.objectStore(STORE_NAME).delete(url);
    tx.objectStore(META_STORE_NAME).delete(url);
    await transactionToPromise(tx);
  } catch (error) {
    console.warn("Failed removing cached audio entry", error);
  }
};
