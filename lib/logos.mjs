// Les logos des médias : le robot les télécharge une fois (64 px), les garde dans sa mémoire (.data/logos)
// et les publie avec le site. L'app les sert elle-même : aucune requête vers un service tiers depuis le téléphone.
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OK_DOMAIN = /^[a-z0-9.-]{3,80}$/;
const RETRY_MS = 7 * 864e5; // un média sans logo : on réessaie dans une semaine

async function fetchLogo(domain) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: ctl.signal });
    if (!r.ok || !/image\//.test(r.headers.get("content-type") || "")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 120 && buf.length < 60000 ? buf : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Télécharge les logos manquants (au plus `max` par passage) puis copie ceux qu'on a dans `outDir`.
 *  Retourne la liste des domaines qui ont un logo publié. */
export async function buildLogos(domains, cacheDir, outDir, { max = 700, conc = 16 } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const list = [...new Set(domains)].map((d) => String(d || "").toLowerCase().replace(/^www\./, "")).filter((d) => OK_DOMAIN.test(d));
  const png = (d) => join(cacheDir, `${d}.png`), none = (d) => join(cacheDir, `${d}.none`);
  const want = list.filter((d) => !existsSync(png(d)) && !(existsSync(none(d)) && Date.now() - statSync(none(d)).mtimeMs < RETRY_MS)).slice(0, max);
  let got = 0;
  for (let i = 0; i < want.length; i += conc) {
    await Promise.all(want.slice(i, i + conc).map(async (d) => {
      const buf = await fetchLogo(d);
      if (buf) { writeFileSync(png(d), buf); got++; } else writeFileSync(none(d), "");
    }));
  }
  const have = list.filter((d) => existsSync(png(d)));
  for (const d of have) copyFileSync(png(d), join(outDir, `${d}.png`));
  return { have, fetched: got, tried: want.length };
}

export const readLogoList = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return []; } };
