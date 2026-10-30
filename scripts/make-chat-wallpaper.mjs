// Gera o papel de parede do chat (desenhos próprios, só traço) em dois tons:
//   public/assets/chat/wallpaper-light.svg e wallpaper-dark.svg
// Uso: node scripts/make-chat-wallpaper.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Desenhos numa grelha de 24×24
const D = {
  bubble: 'M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  plane: 'M21 3L10 14M21 3l-6.5 18-4.5-7-7-4.5z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14c1 1.4 2.4 2 4 2s3-.6 4-2M9 9.5h.01M15 9.5h.01',
  camera: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pin: 'M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cloud: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-1.5-3-5-3-5-1s3 1 5 1zM12 9c1.5-3 5-3 5-1s-3 1-5 1z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  note: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  cup: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 1-1 1.5-1 2.5M12 3c0 1-1 1.5-1 2.5',
  leaf: 'M5 19C5 10 11 5 20 4c0 9-5 15-14 15zM5 19l8-8',
  check: 'M4 12l5 5L20 6',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4',
};

// Posição (x, y), rotação e desenho — espalhados na peça de 320×320, longe das bordas
const ITEMS = [
  [24, 20, -12, 'bubble'], [92, 46, 10, 'heart'], [158, 18, -6, 'camera'], [228, 40, 14, 'note'], [282, 14, -18, 'star'],
  [40, 92, 18, 'plane'], [118, 104, -8, 'smile'], [190, 88, 6, 'mail'], [262, 100, -14, 'cloud'],
  [14, 156, -4, 'cup'], [80, 168, 12, 'pin'], [150, 150, -16, 'gift'], [222, 162, 8, 'phone'], [286, 152, -6, 'leaf'],
  [40, 228, 8, 'sun'], [112, 236, -10, 'bubble'], [180, 222, 16, 'clock'], [250, 236, -8, 'heart'],
  [18, 284, -14, 'star'], [86, 292, 6, 'check'], [150, 282, -6, 'note'], [218, 290, 12, 'smile'], [286, 278, -10, 'spark'],
];

function svg(stroke) {
  const shapes = ITEMS.map(([x, y, r, k]) =>
    `<path transform="translate(${x} ${y}) rotate(${r} 12 12) scale(1.05)" d="${D[k]}"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><g fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>\n`;
}

const out = join(process.cwd(), 'public/assets/chat');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'wallpaper-light.svg'), svg('#cfc4b4'));
writeFileSync(join(out, 'wallpaper-dark.svg'), svg('#1b2a32'));
console.log('ok');
