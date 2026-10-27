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
  const env = loadEnv(mode, __dirname, 'VITE_');
  const resolved = Object.keys(env).sort();
  console.log(
    `[build] VITE_* variables visible to this build: ${resolved.join(', ') || '(none)'}`
  );

  // Unfinished work, kept out of the build that has the lab switched off.
  //
  // src/lib/lab.js explains why the flag exists. The flag alone hides a
  // surface; it does not keep the code out of the bundle. `LAB && <Panel/>`
  // still pulls the module into the graph, and even behind React.lazy the
  // dynamic import is statically analysable, so Rollup emits the chunk and it
  // ships -- unreachable, but sitting on the CDN for anyone who guesses the
  // filename. Measured, not assumed: a production build emitted
  // SnapTradePanel-*.js at 12.58 kB with the flag already off.
  //
  // Aliasing the module to a stub removes it from the graph outright, so the
  // guarantee is "the code is not there" rather than "nothing calls it". That
  // is the difference between a feature that is off and a feature that is not
  // shipped, and it is the one the owner asked for on 23 Sep: ship the small
  // fixes without waiting for the brokers, and without the brokers going out.
  //
  // Adding to this list is the whole ceremony for putting work in the lab; the
  // matching LAB check at the call site is what keeps the stub from rendering.
  const LAB_MODULES = [
    '@/components/admin/SnapTradePanel',
    '@/components/analysis/AnalysisLayoutB',
    // The staging trading terminal (24 Oct 2026): page only; its components
    // are reached from it alone, so stubbing the page drops them too.
    '@/pages/Terminal'
  ];
  const labOn = env.VITE_LAB === '1';
  const labAliases = labOn
    ? {}
    : Object.fromEntries(
        LAB_MODULES.map((id) => [id, path.resolve(__dirname, './src/lib/labStub.jsx')])
      );
  console.log(
    `[build] lab: ${labOn ? 'ON — lab modules included' : `off — ${LAB_MODULES.length} module(s) stubbed out`}`
  );

  // This build's own id, served at /version.json, so a page left open can
  // tell when a newer one is out and say so (src/lib/useNewVersion.js). The
  // owner keeps the terminal open for hours; on 27 Oct a fix deployed at
  // 16:18 was not on his screen at 16:21, and a sale went out the old way.
  const BUILD_ID = (process.env.GITHUB_SHA || '').slice(0, 12) || new Date().toISOString();
  const buildId = {
    name: 'build-id',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    }
  };

  return {
    plugins: [react(), buildId],
    define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID) },
    resolve: {
      alias: {
        // Longest-first: '@' would otherwise swallow every '@/...' lab path
        // before its own entry is reached, and the stub would never apply.
        ...labAliases,
        '@': path.resolve(__dirname, './src')
      }
    }
  };
});
