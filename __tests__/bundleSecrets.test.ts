import fs from 'fs';
import os from 'os';
import path from 'path';
const { scan } = require('../scripts/check-bundle-secrets.js');

describe('check-bundle-secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('flags AIza keys and GEMINI strings', () => {
    fs.writeFileSync(path.join(dir, 'a.js'), 'var k="AIzaSyA1234567890abcdefghijk";');
    fs.writeFileSync(path.join(dir, 'b.js'), 'process.env.GEMINI_API_KEY');
    const hits = scan([dir]);
    expect(hits.map((h: any) => path.basename(h.file)).sort()).toEqual(expect.arrayContaining(['a.js', 'b.js']));
  });
  it('passes clean bundles', () => {
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-'));
    fs.writeFileSync(path.join(clean, 'ok.js'), 'console.log("hello")');
    expect(scan([clean])).toEqual([]);
    fs.rmSync(clean, { recursive: true, force: true });
  });
  it('app source and config are clean', () => {
    const root = path.resolve(__dirname, '..');
    const hits = scan(['app', 'src', 'app.json', 'package.json', '.env.example'].map((p) => path.join(root, p)));
    expect(hits).toEqual([]);
  });
});
