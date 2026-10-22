// 텍스처 파일 → three 텍스처 (PNG·JPG·WEBP / PSD 합친 이미지 / CLIP 캔버스 미리보기)
//  Mac판(main.js decodeTexture)과 같은 방식을 브라우저에서
import * as THREE from 'three';
import { readPsd } from 'ag-psd';
import initSqlJs from 'sql.js';
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';

let SQL = null;

// flip: FBX·OBJ UV는 아래가 0 → 위아래 뒤집어 올림 / glTF는 그대로
export async function makeTexture(file, flip) {
  const name = file.name.toLowerCase();
  let source;
  if (name.endsWith('.psd')) {
    // 합쳐진 이미지 (포토샵·클립 스튜디오 PSD 내보내기에 들어 있음)
    const psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true });
    if (!psd.canvas) throw new Error('PSD 안에 합쳐진 이미지가 없습니다 (포토샵이면 "호환성 최대화"를 켜고 저장)');
    source = await createImageBitmap(psd.canvas, { imageOrientation: flip ? 'flipY' : 'none' });
  } else if (name.endsWith('.clip')) {
    // 클립 스튜디오 파일 안 SQLite의 CanvasPreview (캔버스 전체 미리보기 PNG — 원본보다 작을 수 있음)
    const buf = new Uint8Array(await file.arrayBuffer());
    const at = indexOf(buf, 'SQLite format 3');
    if (at < 0) throw new Error('CLIP 파일 안에서 데이터를 찾지 못했습니다');
    SQL ??= await initSqlJs({ locateFile: () => sqlWasm });
    const db = new SQL.Database(buf.subarray(at));
    let png;
    try { png = db.exec('SELECT ImageData FROM CanvasPreview LIMIT 1')[0]?.values[0]?.[0]; } finally { db.close(); }
    if (!png) throw new Error('CLIP 파일에 캔버스 미리보기가 없습니다');
    source = await createImageBitmap(new Blob([png], { type: 'image/png' }), { imageOrientation: flip ? 'flipY' : 'none' });
  } else {
    source = await createImageBitmap(file, { imageOrientation: flip ? 'flipY' : 'none' });
  }
  const tex = new THREE.Texture(source);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

function indexOf(buf, text) {
  const t = new TextEncoder().encode(text);
  outer: for (let i = 0; i <= buf.length - t.length; i++) { for (let j = 0; j < t.length; j++) if (buf[i + j] !== t[j]) continue outer; return i; }
  return -1;
}

export const IS_MODEL = /\.(fbx|obj|glb|gltf)$/i;
export const IS_IMAGE = /\.(png|jpe?g|webp|psd|clip)$/i;
