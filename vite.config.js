import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite only inlines VITE_-prefixed variables it finds in the build process's
// environment, and a missing one becomes a literal `undefined` in the bundle
// with no warning. Log the names it can see so a misconfigured CI build says so
// in its own log instead of shipping a broken bundle. Names only — never values.
const visibleEnvNames = Object.keys(process.env).filter((k) => k.startsWith('VITE_')).sort();
console.log(
  `[build] VITE_* variables visible to this build: ${visibleEnvNames.join(', ') || '(none)'}`
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
