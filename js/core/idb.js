/* IndexedDB 키-값 저장소 (아이콘 이미지처럼 localStorage에 넣기엔 큰 데이터용) */
const DB = 'maple-helper', STORE = 'kv';
let dbp = null;

function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req.result);
    tx.onerror = tx.onabort = () => rej(tx.error);
  }));
}

export const idbGet = key => run('readonly', s => s.get(key));
export const idbSet = (key, val) => run('readwrite', s => s.put(val, key));
export const idbDel = key => run('readwrite', s => s.delete(key));
