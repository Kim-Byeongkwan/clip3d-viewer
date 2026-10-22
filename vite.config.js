import { defineConfig } from 'vite';
// base './' — 어느 주소(하위 폴더 포함)에 올려도 동작
export default defineConfig({ base: './', build: { target: 'es2022', assetsInlineLimit: 0 } });
