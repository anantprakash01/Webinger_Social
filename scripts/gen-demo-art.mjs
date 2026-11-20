/**
 * Generates the abstract placeholder artwork used by the Phase 0 seed data:
 *   public/demo/photo-01..24.svg   profile photos (abstract, no people)
 *   public/demo/cover-01..12.svg   profile cover images
 *   public/demo/work-01..36.svg    portfolio images
 * Deterministic: re-running produces identical files. Run with `npm run gen:art`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo');
mkdirSync(out, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ['#0f1b33', '#d40000', '#f5e6d3'],
  ['#1d5fbf', '#f2b134', '#fdf6ec'],
  ['#17703d', '#e9c46a', '#f1faee'],
  ['#5b2a86', '#ff7f50', '#fff0e6'],
  ['#264653', '#2a9d8f', '#e9f5f2'],
  ['#8a1c1c', '#f4a261', '#fff4e0'],
  ['#3d405b', '#81b29a', '#f4f1de'],
  ['#1b263b', '#e0a458', '#f7f3e3'],
  ['#6d597a', '#e56b6f', '#fbe8e7'],
  ['#14213d', '#fca311', '#e5e5e5'],
  ['#2b2d42', '#ef233c', '#edf2f4'],
  ['#004e64', '#9fffcb', '#e6fbff'],
];

const f = (n) => Math.round(n * 10) / 10;

function shapes(r, w, h, [dark, accent, light], count) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const kind = r();
    const color = [dark, accent, light][Math.floor(r() * 3)];
    const op = f(0.35 + r() * 0.6);
    const x = f(r() * w);
    const y = f(r() * h);
    const size = f((0.12 + r() * 0.45) * Math.min(w, h));
    if (kind < 0.45) s += `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${color}" opacity="${op}"/>`;
    else if (kind < 0.8)
      s += `<rect x="${f(x - size / 2)}" y="${f(y - size / 2)}" width="${size}" height="${f(size * (0.4 + r()))}" rx="${f(size * 0.12)}" fill="${color}" opacity="${op}" transform="rotate(${Math.round(r() * 90 - 45)} ${x} ${y})"/>`;
    else s += `<path d="M${x} ${f(y - size / 2)} L${f(x + size / 2)} ${f(y + size / 2)} L${f(x - size / 2)} ${f(y + size / 2)} Z" fill="${color}" opacity="${op}"/>`;
  }
  return s;
}

function svg(w, h, seed, count, label) {
  const r = rng(seed);
  const pal = PALETTES[seed % PALETTES.length];
  const [dark, accent, light] = pal;
  const angle = Math.round(r() * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">
<defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${r() > 0.5 ? accent : dark}" stop-opacity="0.55"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="${light}"/><rect width="${w}" height="${h}" fill="url(#g)"/>
${shapes(r, w, h, pal, count)}
</svg>
`;
}

const pad = (n) => String(n).padStart(2, '0');
for (let i = 1; i <= 24; i++) writeFileSync(join(out, `photo-${pad(i)}.svg`), svg(240, 240, 100 + i, 5, 'Abstract profile image'));
for (let i = 1; i <= 12; i++) writeFileSync(join(out, `cover-${pad(i)}.svg`), svg(1200, 360, 200 + i, 9, 'Abstract cover image'));
for (let i = 1; i <= 36; i++) writeFileSync(join(out, `work-${pad(i)}.svg`), svg(600, 750, 300 + i, 7, 'Abstract portfolio image'));
console.log(`Wrote 72 files to ${out}`);
