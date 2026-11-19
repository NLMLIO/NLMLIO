import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 서버와 같은 순서로 환경변수를 읽는다: 셸 > .superset/workspace.env > .env
const root = fileURLToPath(new URL('..', import.meta.url));
for (const file of ['.superset/workspace.env', '.env']) {
  if (existsSync(root + file)) process.loadEnvFile(root + file);
}

const clientPort = Number(process.env.CLIENT_PORT ?? 5173);
const serverUrl = `http://localhost:${process.env.SERVER_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // shared는 빌드 산출물 대신 TS 원본을 바로 쓴다.
    alias: { '@nlmlio/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  server: {
    port: clientPort,
    strictPort: true,
    // 같은 출처로 보이게 해서 CORS 없이 서버에 붙는다.
    proxy: {
      '/api': serverUrl,
      '/socket.io': { target: serverUrl, ws: true },
    },
  },
});
