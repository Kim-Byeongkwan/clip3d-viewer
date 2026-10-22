// Clip3D Viewer 웹앱 (2026-10-22, 아이패드용) — Mac판(clip3d-mac/src/viewer.js)의 보기·재질·텍스처 자동 연결을 그대로 옮김
//  아이패드 웹은 파일 저장을 감지할 수 없어서 '저장 즉시 반영' 대신 [↻ 다시 불러오기]: 바뀐 파일들을 다시 고르면 이름으로 재질에 다시 입힘
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeTexture, IS_MODEL, IS_IMAGE } from './decode.js';
import { saveWork, loadWork, clearWork, getSettings, setSettings } from './store.js';
import { ViewGizmo } from './gizmo.js';

const $ = (id) => document.getElementById(id);
let S = getSettings();

// ---------------------------------------------------------------- 화면
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }; // 한 손가락 회전 · 두 손가락 이동·확대
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.4);
const key = new THREE.DirectionalLight(0xffffff, 1.6);
scene.add(hemi, key, key.target);

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
document.body.style.background = S.bg;

// ---------------------------------------------------------------- 상태
const st = {
  modelFile: null, root: null, mode: 'tex', lighting: S.lighting,
  mats: [], // { name, lit, flat, texFile, meshes:[] }
};

function toast(t, ms = 2200) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (e.style.display = 'none'), ms); }
const busy = (on, t = '불러오는 중…') => { $('busy').textContent = t; $('busy').style.display = on ? 'flex' : 'none'; };

// ---------------------------------------------------------------- 이름 맞추기 (Mac판과 같음)
// 확장자·basecolor/albedo 같은 꼬리말·끝 번호·기호 제거 (예: GG_outFit_baseColor_1 → ggoutfit)
const norm = (s) => s.toLowerCase().replace(/\.[^.]+$/, '')
  .replace(/[_\-\s.]*(base[_\s]?colou?r|albedo|diffuse|colou?r|col|tex(ture)?|painted|d|\d+)(?=([_\-\s.]|$))/g, '')
  .replace(/[^a-z0-9가-힣]+/g, '');
function similar(a, b) {
  const m = a.length, n = b.length; if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}
function matchScore(fileName, matName) {
  const f = norm(fileName), k = norm(matName); if (!k || !f) return 0;
  if (f === k) return 4; if (f.startsWith(k) || k.startsWith(f)) return 3; if (f.includes(k) || k.includes(f)) return 2;
  const sim = Math.max(similar(f, k), similar(f.replace(/^gg/, ''), k.replace(/^gg/, ''))); return sim >= 0.7 ? sim : 0;
}

// ---------------------------------------------------------------- 모델
async function loadModel(file, { keepView = false, textures = null } = {}) {
  const prevTex = keepView ? Object.fromEntries(st.mats.filter((m) => m.texFile).map((m) => [m.name, m.texFile])) : null;
  const prevCam = keepView ? { cam: camera.position.clone(), tgt: controls.target.clone() } : null;
  busy(true, '모델 불러오는 중…');
  try {
    const ab = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    let root;
    if (ext === 'fbx') root = new FBXLoader().parse(ab, '');
    else if (ext === 'obj') root = new OBJLoader().parse(new TextDecoder().decode(ab));
    else root = (await new GLTFLoader().parseAsync(ab, '')).scene;
    standUp(root);
    setModel(root, file, keepView);
    const keep = textures ?? prevTex ?? {};
    for (const m of st.mats) if (keep[m.name]) await setTexture(m, keep[m.name], { quiet: true });
    if (prevCam) { camera.position.copy(prevCam.cam); controls.target.copy(prevCam.tgt); controls.update(); }
    toast(keepView ? `다시 불러옴: ${file.name}` : `모델: ${file.name} · 재질 ${st.mats.length}개`);
    remember();
  } catch (e) { console.error(e); toast('모델을 열지 못했습니다\n' + (e.message || e), 6000); }
  finally { busy(false); }
}

// 누워 있는 모델(Z가 위인 FBX 등) 세우기
function standUp(root) {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  if (size.z > size.y * 1.3 && size.z >= size.x * 0.6) { root.rotation.x -= Math.PI / 2; root.updateMatrixWorld(true); }
}

function setModel(root, file, keepView) {
  if (st.root) { scene.remove(st.root); st.root.traverse((o) => { o.geometry?.dispose?.(); }); }
  st.root = root; st.modelFile = file; st.mats = [];
  const byName = new Map();
  // 메시를 먼저 모은 뒤 처리 (돌면서 와이어 사본을 자식으로 붙이면 그 사본까지 다시 돌아 끝없이 반복됐음)
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshes.forEach((o) => {
    const list = Array.isArray(o.material) ? o.material : [o.material];
    o.userData.c3d = list.map((src, i) => {
      const name = (src && src.name) || `${o.name || 'mesh'}_${i}`;
      let m = byName.get(name);
      if (!m) {
        const map = src?.map ?? null; // GLB에 들어 있던 텍스처는 처음에 그대로 보여 줌
        if (map) map.colorSpace = THREE.SRGBColorSpace;
        const color = map ? 0xffffff : (src?.color?.getHex?.() ?? 0xcccccc);
        const common = { map, color, side: THREE.DoubleSide, transparent: !!src?.transparent, alphaTest: src?.alphaTest || 0 };
        m = { name, texFile: null, meshes: [], lit: new THREE.MeshStandardMaterial({ ...common, roughness: 0.9, metalness: 0 }), flat: new THREE.MeshBasicMaterial(common) };
        byName.set(name, m); st.mats.push(m);
      }
      m.meshes.push(o);
      return m;
    });
    // 와이어 사본 (뼈 붙은 메시도 자세를 따라가게 같은 종류로)
    const wm = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, depthWrite: false });
    const w = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, wm) : new THREE.Mesh(o.geometry, wm);
    if (o.isSkinnedMesh) w.bind(o.skeleton, o.bindMatrix);
    w.userData.wire = true; w.renderOrder = 1;
    o.add(w);
  });
  scene.add(root);
  fillMaterialSelect(); applyMode();
  if (!keepView) resetView();
  $('empty').style.display = 'none';
}

function fillMaterialSelect() {
  const sel = $('mat'), cur = sel.value; sel.innerHTML = '';
  st.mats.forEach((m, i) => sel.add(new Option(m.name + (m.texFile ? ' ●' : ''), i)));
  if (cur !== '' && +cur < st.mats.length) sel.value = cur;
}
const currentMat = () => st.mats[+$('mat').value] ?? st.mats[0];

// 보기: 텍스처만 / 와이어+텍스처 / 와이어만
function applyMode() {
  const showTex = st.mode !== 'wire', showWire = st.mode !== 'tex';
  for (const m of st.mats) {
    for (const mesh of m.meshes) { const mats = mesh.userData.c3d.map((x) => (st.lighting ? x.lit : x.flat)); mesh.material = mats.length === 1 ? mats[0] : mats; }
    for (const mm of [m.lit, m.flat]) mm.colorWrite = showTex;
  }
  st.root?.traverse((o) => { if (o.userData.wire) { o.visible = showWire; o.material.color.set(S.wireColor); o.material.opacity = S.wireOpacity; } });
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
  $('bLight').classList.toggle('on', st.lighting);
}

function resetView() {
  if (!st.root) return;
  const box = new THREE.Box3().setFromObject(st.root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) || 1;
  camera.near = r / 500; camera.far = r * 100; camera.updateProjectionMatrix();
  // 화면 비율까지 따져 모델 전체가 들어오는 거리 (아이폰·세로 아이패드에서 팔·머리가 잘렸음 — 2026-10-22)
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dist = Math.max((size.y / 2) / Math.tan(vf), (Math.max(size.x, size.z) / 2) / Math.tan(hf)) * 1.15 + size.z / 2;
  camera.position.copy(c).add(new THREE.Vector3(0, r * 0.05, dist));
  controls.target.copy(c); controls.update();
  key.position.copy(c).add(new THREE.Vector3(r, r * 2, r * 1.5)); key.target.position.copy(c);
}

// ---------------------------------------------------------------- 텍스처
const isGltfLike = () => /\.(glb|gltf)$/i.test(st.modelFile?.name || '');
async function setTexture(m, file, { quiet = false } = {}) {
  try {
    const tex = await makeTexture(file, !isGltfLike());
    for (const mm of [m.lit, m.flat]) { if (mm.map && mm.map !== tex) mm.map.dispose(); mm.map = tex; mm.color.set(0xffffff); mm.needsUpdate = true; }
    m.texFile = file;
    fillMaterialSelect();
    if (!quiet) remember();
    return true;
  } catch (e) { console.error(e); toast(`텍스처를 읽지 못했습니다: ${file.name}\n${e.message || e}`, 6000); return false; }
}

// 여러 이미지 → 재질 이름과 비슷한 것끼리 연결. 하나뿐이고 맞는 이름이 없으면 고른 재질에
async function applyImages(files, { fallback = true } = {}) {
  const imgs = files.filter((f) => IS_IMAGE.test(f.name));
  if (!imgs.length) return 0;
  if (!st.root) { toast('먼저 모델을 여세요'); return 0; }
  busy(true, '텍스처 입히는 중…');
  const used = new Set(); let n = 0;
  try {
    // 이미 같은 파일 이름으로 연결돼 있던 재질이 1순위 (다시 불러오기)
    for (const m of st.mats) {
      let pick = m.texFile ? imgs.find((f) => f.name === m.texFile.name) : null;
      if (!pick) {
        const ranked = imgs.map((f) => [matchScore(f.name, m.name), f]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0] || (/\.(psd|clip)$/i.test(a[1].name) - /\.(psd|clip)$/i.test(b[1].name)));
        pick = ranked[0]?.[1];
      }
      if (pick && (await setTexture(m, pick, { quiet: true }))) { used.add(pick); n++; }
    }
    if (!n && fallback && imgs.length === 1) { const m = currentMat(); if (await setTexture(m, imgs[0], { quiet: true })) { n = 1; toast(`${imgs[0].name} → ${m.name}`); } }
    else if (n) toast(`텍스처 ${n}개 연결` + (imgs.length > used.size ? ` (이름이 안 맞은 이미지 ${imgs.length - used.size}개는 건너뜀 — 재질을 고르고 한 장씩)` : ''), 2600);
    else toast('재질 이름과 맞는 이미지가 없습니다 — 재질을 고르고 한 장만 고르세요', 3500);
    remember();
  } finally { busy(false); }
  return n;
}

// 다시 불러오기: 고른 파일 중 모델이 있으면 모델 다시(카메라·텍스처 유지), 이미지는 이름으로 다시 입힘
async function reloadWith(files) {
  const model = files.find((f) => IS_MODEL.test(f.name));
  if (model) await loadModel(model, { keepView: !!st.root });
  await applyImages(files, { fallback: false });
}

// 저장 (다음에 열 때 이어서)
let remT = 0;
function remember() {
  if (!S.restoreLast || !st.modelFile) return;
  clearTimeout(remT);
  remT = setTimeout(() => saveWork(st.modelFile, Object.fromEntries(st.mats.filter((m) => m.texFile).map((m) => [m.name, m.texFile]))), 500);
}

// ---------------------------------------------------------------- 조작
const pick = (id) => new Promise((res) => { const el = $(id); el.value = ''; el.onchange = () => res([...el.files]); el.click(); });
$('bModel').onclick = async () => { const [f] = await pick('fModel'); if (!f) return; if (!IS_MODEL.test(f.name)) return toast('FBX · OBJ · GLB 파일을 골라 주세요'); loadModel(f); };
$('bTex').onclick = async () => { if (!st.root) return toast('먼저 모델을 여세요'); const fs = await pick('fTex'); if (fs.length) applyImages(fs); };
$('bReload').onclick = async () => { if (!st.root) return $('bModel').onclick(); const fs = await pick('fReload'); if (fs.length) reloadWith(fs); };
document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; applyMode(); }));
$('bLight').onclick = () => { st.lighting = !st.lighting; applyMode(); S = setSettings({ lighting: st.lighting }); };
$('bReset').onclick = resetView;
$('bHide').onclick = () => { $('bar').classList.add('hidden'); $('bShow').style.display = ''; };
$('bShow').onclick = () => { $('bar').classList.remove('hidden'); $('bShow').style.display = 'none'; };
$('bMats').onclick = () => {
  $('matList').innerHTML = st.mats.length ? st.mats.map((m) => `<div><span>${esc(m.name)}</span><span>${m.texFile ? esc(m.texFile.name) : '(텍스처 없음)'}</span></div>`).join('') : '<p class="hint">모델을 먼저 여세요</p>';
  $('dlgMats').showModal();
};
$('mClose').onclick = () => $('dlgMats').close();
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 두 번 톡 = 시점 초기화
let lastTap = 0;
renderer.domElement.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') return; const t = performance.now(); if (t - lastTap < 300) resetView(); lastTap = t; });

// 끌어 놓기 (아이패드 화면 분할에서 '파일' 앱 → 뷰어, 맥 브라우저에서도)
const ray = new THREE.Raycaster();
function matUnder(x, y) {
  if (!st.root) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObject(st.root, true).find((h) => h.object.isMesh && h.object.userData.c3d);
  if (!hit) return null;
  const list = hit.object.userData.c3d; return list[hit.face?.materialIndex ?? 0] ?? list[0];
}
let dragN = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; $('drop').style.display = 'flex'; });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('drop').style.display = 'none'; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault(); dragN = 0; $('drop').style.display = 'none';
  const files = [...e.dataTransfer.files];
  const model = files.find((f) => IS_MODEL.test(f.name));
  if (model) await loadModel(model, { keepView: false });
  const imgs = files.filter((f) => IS_IMAGE.test(f.name));
  if (imgs.length === 1) { const m = matUnder(e.clientX, e.clientY) || currentMat(); if (!m) return toast('먼저 모델을 여세요'); if (await setTexture(m, imgs[0])) toast(`${imgs[0].name} → ${m.name}`); }
  else if (imgs.length) applyImages(imgs);
});

// ---------------------------------------------------------------- 설정
function openSettings() {
  $('sWire').value = S.wireColor; $('sWireA').value = S.wireOpacity; $('sBg').value = S.bg; $('sRestore').checked = !!S.restoreLast;
  $('dlg').showModal();
}
const saveSet = (patch) => { S = setSettings(patch); document.body.style.background = S.bg; applyMode(); };
$('bSet').onclick = openSettings;
$('sWire').oninput = () => saveSet({ wireColor: $('sWire').value });
$('sWireA').oninput = () => saveSet({ wireOpacity: +$('sWireA').value });
$('sBg').oninput = () => saveSet({ bg: $('sBg').value });
$('sRestore').onchange = () => { saveSet({ restoreLast: $('sRestore').checked }); if (!S.restoreLast) clearWork(); else remember(); };
$('sClear').onclick = async () => { await clearWork(); toast('저장된 작업을 지웠어요', 1200); };
$('sClose').onclick = () => $('dlg').close();

// ---------------------------------------------------------------- 시점 기즈모 (블렌더식, 2026-10-22 피드백)
const phone = matchMedia('(max-width: 600px)').matches; // 폰은 기즈모 작게·위로
const gizmo = new ViewGizmo(camera, controls, { size: phone ? 88 : 112, style: { right: phone ? '8px' : '14px', top: `calc(env(safe-area-inset-top) + ${phone ? 56 : 74}px)` }, onView: (n) => n && toast(n, 700) });
$('bHide').addEventListener('click', () => (gizmo.canvas.style.top = 'calc(env(safe-area-inset-top) + 14px)'));
$('bShow').addEventListener('click', () => (gizmo.canvas.style.top = `calc(env(safe-area-inset-top) + ${phone ? 56 : 74}px)`));

// ---------------------------------------------------------------- 시작
resize();
(function loop() { requestAnimationFrame(loop); controls.update(); gizmo.update(); renderer.render(scene, camera); })();
if (S.restoreLast) {
  const w = await loadWork();
  if (w?.model) await loadModel(w.model, { textures: w.textures });
}
// 오프라인에서도 열리게 (홈 화면 앱) — https 또는 localhost에서만
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__c3d = { st, loadModel, setTexture, applyImages, reloadWith, scene, camera, renderer, controls, gizmo };
