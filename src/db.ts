export class StateDB<T> {
  private dbPromise: Promise<IDBDatabase>;

  constructor(
    dbName: string,
    private storeName: string = "state",
  ) {
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async store(state: T): Promise<void> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db!.transaction([this.storeName], "readwrite");
      const request = tx.objectStore(this.storeName).put(state, this.storeName);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async load(): Promise<T | undefined> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db!.transaction([this.storeName], "readonly");
      const request = tx.objectStore(this.storeName).get(this.storeName);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
