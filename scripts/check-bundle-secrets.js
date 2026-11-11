#!/usr/bin/env node
/**
 * Fails (exit 1) if any Google API key pattern (AIza...) or the (upper-case) string GEMINI, e.g. GEMINI_API_KEY, appears; the prose privacy disclosure 'Google Gemini' is allowed in
 * the app's source/config or a built JS bundle.
 *
 * Usage: node scripts/check-bundle-secrets.js [path ...]
 * Default paths: app src app.json package.json .env.example dist (dist only if present).
 */
const fs = require('fs');
const path = require('path');

const PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_\-]{10,}/ },
  { name: 'AIza prefix', re: /AIza/ },
  { name: 'GEMINI reference', re: /GEMINI/ },
];
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'coverage']);
const TEXT_EXT = /\.(js|jsx|ts|tsx|json|map|hbc|html|txt|env|example|md|plist|xml|gradle|properties)$|^[^.]+$/i;

function* walk(p) {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isFile()) { yield p; return; }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    yield* walk(path.join(p, e.name));
  }
}

function scan(paths, { selfPath } = {}) {
  const hits = [];
  for (const root of paths) {
    for (const file of walk(root)) {
      if (selfPath && path.resolve(file) === path.resolve(selfPath)) continue;
      if (!TEXT_EXT.test(path.basename(file)) && !/\.(hbc|bundle)$/.test(file)) continue;
      let text;
      try { text = fs.readFileSync(file, 'latin1'); } catch { continue; }
      for (const { name, re } of PATTERNS) {
        const m = re.exec(text);
        if (m) hits.push({ file, name, sample: m[0].slice(0, 6) + '...' });
      }
    }
  }
  return hits;
}

module.exports = { scan, PATTERNS };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const targets = (args.length ? args : ['app', 'src', 'app.json', 'package.json', '.env.example', 'dist']).map((p) => path.resolve(root, p));
  const hits = scan(targets, { selfPath: __filename });
  if (hits.length) {
    console.error('Secret check FAILED:');
    for (const h of hits) console.error(`  ${path.relative(root, h.file)}: ${h.name} (${h.sample})`);
    process.exit(1);
  }
  console.log('Secret check passed: no AIza/GEMINI strings found.');
}
