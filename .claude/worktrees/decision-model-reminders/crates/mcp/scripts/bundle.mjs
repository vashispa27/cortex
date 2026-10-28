import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.ts'], outfile: 'dist/cortex-mcp.mjs', bundle: true,
  platform: 'node', target: 'node20', format: 'esm', sourcemap: false,
  banner: { js: "import { createRequire as cortexCreateRequire } from 'node:module'; const require = cortexCreateRequire(import.meta.url);" },
});
