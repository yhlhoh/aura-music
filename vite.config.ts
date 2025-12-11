import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// 获取构建信息
function getBuildInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return { commit, date };
  } catch {
    return { commit: 'unknown', date: new Date().toISOString().slice(0, 16).replace('T', ' ') };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const productionBase = env.VITE_BASE_PATH || '/aura-music/';
  const buildInfo = getBuildInfo();
  
  return {
    base: mode === 'production' ? productionBase : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // 注入构建信息
      '__BUILD_COMMIT__': JSON.stringify(buildInfo.commit),
      '__BUILD_DATE__': JSON.stringify(buildInfo.date),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
