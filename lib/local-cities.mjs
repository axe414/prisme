// La ville de chaque média local, déduite de ses propres articles : la municipalité qu'il nomme le plus souvent.
// (Un hebdo de Victoriaville parle surtout de Victoriaville.) Sert aux pages de villes de l'app.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Rend { domaine: [nom, région, [villes]] } pour l'app (data/local-media.json).
export function localMediaMap(root, arch) {
  const read = (f) => { try { return JSON.parse(readFileSync(join(root, "data", f), "utf8")).sources || {}; } catch { return {}; } };
  const local = read("sources-local.json");
  const mc = read("sources-mediacloud.json");
  const auto = read("sources-auto.json");
  // Les médias canadiens qui ne sont pas des grands médias nationaux.
  const media = {};
  for (const [d, x] of Object.entries({ ...auto, ...mc, ...local })) if ((x.cc || "") === "CA" && x.region !== "Canada") media[d] = { name: x.name, region: x.region || "", cities: x.cities || [] };

  const vf = join(root, "public", "villes.json");
  if (!existsSync(vf) || !arch) return Object.fromEntries(Object.entries(media).map(([d, m]) => [d, [m.name, m.region, m.cities]]));
  const villes = JSON.parse(readFileSync(vf, "utf8"));
  const byName = new Map();
  for (const v of villes) {
    const k = fold(v.n);
    // « Québec » désigne surtout la province ; les noms très courts sont trop ambigus.
    if (k === "quebec" || k.length < 4 || byName.has(k)) continue;
    byName.set(k, v);
  }
  // Les mentions de chaque municipalité, média par média.
  const counts = new Map();
  for (const r of Object.values(arch.items)) {
    const d = r[2];
    if (!media[d]) continue;
    const text = fold(`${r[0]} ${r[7] || ""}`);
    let c = counts.get(d);
    if (!c) counts.set(d, (c = new Map()));
    const seen = new Set();
    for (const tok of text.split(/[^a-z0-9'’-]+/)) {
      const k = tok.replace(/^[ldjmnstc]['’]/, "").replace(/['’-]+$/, "");
      const v = byName.get(k) || byName.get(tok);
      if (v && !seen.has(v.s)) { seen.add(v.s); c.set(v.s, (c.get(v.s) || 0) + 1); }
    }
  }
  const bySlug = new Map(villes.map((v) => [v.s, v]));
  const out = {};
  for (const [d, m] of Object.entries(media)) {
    const c = [...(counts.get(d) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const total = c.reduce((s, [, n]) => s + n, 0);
    // La ville principale : au moins 3 mentions et 20 % des mentions de villes du média.
    const main = c.filter(([, n]) => n >= 3 && n / total >= 0.2).slice(0, 2).map(([s]) => bySlug.get(s));
    const cities = [...new Set([...m.cities, ...main.map((v) => v.n)])];
    const region = m.region && m.region !== "Québec" ? m.region : main[0]?.r || m.region;
    out[d] = [m.name, region, cities];
  }
  return out;
}
