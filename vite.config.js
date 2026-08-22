import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // A missing VITE_* variable becomes a literal `undefined` in the bundle with no
  // warning from Vite, so log which ones this build actually resolved — from
  // .env files and the environment both, the same set that gets inlined. Names
  // only, never values.
  const resolved = Object.keys(loadEnv(mode, __dirname, 'VITE_')).sort();
  console.log(
    `[build] VITE_* variables visible to this build: ${resolved.join(', ') || '(none)'}`
  );

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
  };
});
