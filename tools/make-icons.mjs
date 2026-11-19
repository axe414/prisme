// Génère les icônes PNG de l'app (prisme sur fond d'encre), sans dépendance : node tools/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [18, 18, 18], WHITE = [242, 239, 232];
const RAYS = [[23, 101, 122], [94, 159, 176], [173, 167, 151], [216, 139, 110], [177, 65, 42]];

// Le dessin, dans un repère 64 × 40 (le même que le logo du site).
const SEGMENTS = [
  { a: [1, 23.5], b: [21, 21], c: WHITE },
  { a: [27, 4], b: [41, 34], c: WHITE }, { a: [41, 34], b: [13, 34], c: WHITE }, { a: [13, 34], b: [27, 4], c: WHITE },
  { a: [32.5, 18.5], b: [63, 7], c: RAYS[0] }, { a: [33.3, 20], b: [63, 14], c: RAYS[1] }, { a: [34, 21.5], b: [63, 21], c: RAYS[2] },
  { a: [34.7, 23], b: [63, 28], c: RAYS[3] }, { a: [35.4, 24.5], b: [63, 35], c: RAYS[4] },
];

function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size, fill) {
  // fill : part de la largeur occupée par le dessin (plus petit pour l'icône « maskable »).
  const scale = (size * fill) / 64, ox = (size - 64 * scale) / 2, oy = (size - 40 * scale) / 2;
  const half = 1.25; // demi-épaisseur du trait, en unités du dessin
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS - ox) / scale, v = (y + (sy + 0.5) / SS - oy) / scale;
      let col = BG;
      for (const s of SEGMENTS) if (distSeg(u, v, s.a, s.b) <= half) col = s.c;
      r += col[0]; g += col[1]; b += col[2];
    }
    const i = (y * size + x) * 4, n = SS * SS;
    px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; px[i + 3] = 255;
  }
  return png(size, size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("icon-192.png", out), render(192, 0.78));
writeFileSync(new URL("icon-512.png", out), render(512, 0.78));
writeFileSync(new URL("icon-maskable-512.png", out), render(512, 0.6));
writeFileSync(new URL("apple-touch-icon.png", out), render(180, 0.74));
console.log("Icônes écrites dans public/icons/");
