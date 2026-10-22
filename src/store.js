// 마지막 작업(모델·텍스처 파일)을 브라우저 저장소(IndexedDB)에 — 사파리가 탭을 닫거나 다시 열어도 이어서
//  설정은 localStorage. 사파리 개인 정보 보호 모드 등에서 실패해도 앱은 그대로 동작
const DB = 'clip3d', OS = 'files';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(OS, mode); const v = fn(t.objectStore(OS)); t.oncomplete = () => res(v?.result ?? v); t.onerror = () => rej(t.error); });
}

// { model: File, textures: { 재질 이름: File } }
export async function saveWork(model, textures) {
  try {
    await tx('readwrite', (s) => { s.clear(); s.put(model, 'model'); s.put(Object.keys(textures), 'names'); for (const [k, f] of Object.entries(textures)) s.put(f, 'tex:' + k); });
  } catch (e) { console.warn('작업 저장 실패', e); }
}
export async function loadWork() {
  try {
    const db = await open();
    const get = (k) => new Promise((res) => { const r = db.transaction(OS).objectStore(OS).get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    const model = await get('model'); if (!model) return null;
    const names = (await get('names')) ?? [], textures = {};
    for (const n of names) { const f = await get('tex:' + n); if (f) textures[n] = f; }
    return { model, textures };
  } catch { return null; }
}
export async function clearWork() { try { await tx('readwrite', (s) => s.clear()); } catch {} }

const DEF = { wireColor: '#4fd1ff', wireOpacity: 0.5, bg: '#3a3d44', lighting: true, restoreLast: true };
export function getSettings() { try { return { ...DEF, ...JSON.parse(localStorage.getItem('clip3d-settings') || '{}') }; } catch { return { ...DEF }; } }
export function setSettings(patch) { const s = { ...getSettings(), ...patch }; try { localStorage.setItem('clip3d-settings', JSON.stringify(s)); } catch {} return s; }
