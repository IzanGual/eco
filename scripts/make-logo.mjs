// Genera el logo «e.» con la «e» cursiva de Instrument Serif convertida a trazado
// (así no depende de la fuente) en versión clara, oscura y adaptable.
import opentype from 'opentype.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const font = opentype.loadSync(fileURLToPath(new URL('../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff', import.meta.url)));
const C = { paper: '#F2EEE6', ink: '#1B1A17', accent: '#D9472B' };

// «e» centrada ópticamente en 512×512
const size = 440;
const glyph = font.getPath('e', 0, 0, size);
const bb = glyph.getBoundingBox();
const w = bb.x2 - bb.x1, h = bb.y2 - bb.y1;
const dotR = 34;
const groupW = w + 18 + dotR * 2;
const ox = (512 - groupW) / 2 - bb.x1 - 6;
const oy = (512 - h) / 2 - bb.y1 + 8;
const e = font.getPath('e', ox, oy, size).toPathData(2);
const dotCx = ox + bb.x2 + 18 + dotR - 6;
const dotCy = oy + bb.y2 - dotR;

const mark = (fg) => `<path d="${e}" fill="${fg}"/><circle cx="${dotCx.toFixed(1)}" cy="${dotCy.toFixed(1)}" r="${dotR}" fill="${C.accent}"/>`;
const svg = (bg, fg, rx = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${bg}"/>${mark(fg)}</svg>`;

const pub = new URL('../public/', import.meta.url);
const files = {
  'logo-light.svg': svg(C.paper, C.ink, 112),
  'logo-dark.svg': svg(C.ink, C.paper, 112),
  // Favicon que sigue el tema del sistema
  'icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><style>.bg{fill:${C.paper}}.fg{fill:${C.ink}}@media (prefers-color-scheme:dark){.bg{fill:${C.ink}}.fg{fill:${C.paper}}}</style><rect class="bg" width="512" height="512" rx="112"/><path class="fg" d="${e}"/><circle cx="${dotCx.toFixed(1)}" cy="${dotCy.toFixed(1)}" r="${dotR}" fill="${C.accent}"/></svg>`,
  // Para iconos temáticos de Android (solo la silueta)
  'icon-mono.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${e}" fill="#000"/><circle cx="${dotCx.toFixed(1)}" cy="${dotCy.toFixed(1)}" r="${dotR}" fill="#000"/></svg>`
};
for (const [n, c] of Object.entries(files)) writeFileSync(new URL(n, pub), c);
writeFileSync(new URL('../src/logo-path.ts', import.meta.url), `// Generado por scripts/make-logo.mjs\nexport const LOGO_E = ${JSON.stringify(e)};\nexport const LOGO_DOT = { cx: ${dotCx.toFixed(1)}, cy: ${dotCy.toFixed(1)}, r: ${dotR} };\n`);

// PNG para la pantalla de inicio (sin esquinas: iOS y Android ya las redondean)
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const tmp = join(tmpdir(), 'eco-logo');
mkdirSync(tmp, { recursive: true });
const pngs = [
  ['apple-touch-icon.png', 180, C.ink, C.paper],
  ['icon-192.png', 192, C.ink, C.paper],
  ['icon-512.png', 512, C.ink, C.paper],
  ['icon-512-light.png', 512, C.paper, C.ink],
  ['icon-mono-512.png', 512, 'transparent', '#000']
];
for (const [name, px, bg, fg] of pngs) {
  const html = join(tmp, name + '.html');
  writeFileSync(html, `<html><body style="margin:0;background:transparent"><svg width="${px}" height="${px}" viewBox="0 0 512 512" style="display:block"><rect width="512" height="512" fill="${bg}"/>${mark(fg).replace(C.accent, name.includes('mono') ? '#000' : C.accent)}</svg></body></html>`);
  const out = fileURLToPath(new URL(name, pub));
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${px},${px}`, `--screenshot=${out}`, pathToFileURL(html).href], { stdio: 'ignore' });
}
console.log('logo generado');
