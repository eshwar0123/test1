/**
 * Module-level file store.
 * Keeps local uploads available across navigation and also mirrors them into
 * IndexedDB so a refresh does not immediately break local-file viewer links.
 */
const store = new Map();
const DB_NAME = "onix-local-files";
const STORE_NAME = "files";
const DB_VERSION = 1;

let dbPromise = null;

const openDb = () => {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);

  return dbPromise;
};

export const storeFile = async (key, file) => {
  store.set(key, file);

  const db = await openDb();
  if (!db) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).catch(() => {});
};

export const getFile = async (key) => {
  if (store.has(key)) return store.get(key);

  const db = await openDb();
  if (!db) return undefined;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const file = req.result;
      if (file) store.set(key, file);
      resolve(file);
    };
    req.onerror = () => resolve(undefined);
  });
};

export const removeFile = async (key) => {
  store.delete(key);

  const db = await openDb();
  if (!db) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).catch(() => {});
};
