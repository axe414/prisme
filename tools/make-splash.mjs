// Écrans de démarrage de l'app installée sur iPhone et iPad (fond d'encre, prisme au centre), sans dépendance.
// Usage : node tools/make-splash.mjs   → public/splash/*.png et les balises <link> à mettre dans index.html.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [18, 18, 18], WHITE = [242, 239, 232];
const RAYS = [[23, 101, 122], [94, 159, 176], [173, 167, 151], [216, 139, 110], [177, 65, 42]];
const SEGMENTS = [
  { a: [1, 23.5], b: [21, 21], c: WHITE },
  { a: [27, 4], b: [41, 34], c: WHITE }, { a: [41, 34], b: [13, 34], c: WHITE }, { a: [13, 34], b: [27, 4], c: WHITE },
  { a: [32.5, 18.5], b: [63, 7], c: RAYS[0] }, { a: [33.3, 20], b: [63, 14], c: RAYS[1] }, { a: [34, 21.5], b: [63, 21], c: RAYS[2] },
  { a: [34.7, 23], b: [63, 28], c: RAYS[3] }, { a: [35.4, 24.5], b: [63, 35], c: RAYS[4] },
];
const distSeg = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function splash(w, h) {
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2]; }
  // Le prisme occupe 34 % de la petite dimension, centré ; on ne dessine que sa zone.
  const scale = (Math.min(w, h) * 0.34) / 64, ox = (w - 64 * scale) / 2, oy = (h - 40 * scale) / 2 - h * 0.02;
  const half = 1.25, SS = 3;
  for (let y = Math.floor(oy - 4); y < Math.ceil(oy + 40 * scale + 4); y++) for (let x = Math.floor(ox - 4); x < Math.ceil(ox + 64 * scale + 4); x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS - ox) / scale, v = (y + (sy + 0.5) / SS - oy) / scale;
      let col = BG;
      for (const s of SEGMENTS) if (distSeg(u, v, s.a, s.b) <= half) col = s.c;
      r += col[0]; g += col[1]; b += col[2];
    }
    const i = (y * w + x) * 3, n = SS * SS;
    px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n;
  }
  return png(w, h, px);
}
// [largeur en points, hauteur en points, densité] — portrait ; les iPad aussi en paysage.
const DEVICES = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];
const out = new URL("../public/splash/", import.meta.url);
mkdirSync(out, { recursive: true });
const links = [];
for (const [dw, dh, r] of DEVICES) {
  const pad = dw >= 744;
  for (const orient of pad ? ["portrait", "landscape"] : ["portrait"]) {
    const [w, h] = orient === "portrait" ? [dw * r, dh * r] : [dh * r, dw * r];
    const name = `splash-${w}x${h}.png`;
    writeFileSync(new URL(name, out), splash(w, h));
    links.push(`  <link rel="apple-touch-startup-image" href="splash/${name}" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${orient})">`);
  }
}
writeFileSync(new URL("links.txt", out), links.join("\n"));
console.log(`${links.length} écrans de démarrage écrits dans public/splash/`);
