type QueueAction = {
  id: string;
  createdAt: number;
  type: string;
  payload: any;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dealexpress_offline", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("actions")) {
        const store = db.createObjectStore("actions", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function enqueueAction(action: Omit<QueueAction, "createdAt">) {
  const db = await openDb();
  const tx = db.transaction("actions", "readwrite");
  tx.objectStore("actions").put({ ...action, createdAt: Date.now() });
  await txDone(tx);
}

export async function listActions(): Promise<QueueAction[]> {
  const db = await openDb();
  const tx = db.transaction("actions", "readonly");
  const store = tx.objectStore("actions");
  const req = store.getAll();
  const rows = await new Promise<any[]>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function removeActions(ids: string[]) {
  const db = await openDb();
  const tx = db.transaction("actions", "readwrite");
  const store = tx.objectStore("actions");
  for (const id of ids) store.delete(id);
  await txDone(tx);
}

