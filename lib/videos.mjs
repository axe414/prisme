// Les dernières vidéos des chaînes YouTube des médias, lues par leurs flux RSS publics (aucune clé, aucun quota).
// Limite de YouTube : chaque flux ne montre que les 15 dernières vidéos d'une chaîne. Le robot garde donc en mémoire
// chaque vidéo vue d'un passage à l'autre (.data/videos.json) pour couvrir toute la semaine.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { YOUTUBE, YOUTUBE_MORE } from "./sources.mjs";
import { mediaSummary } from "./media-db.mjs";
import { decode } from "./news.mjs";

const UA = "Mozilla/5.0 (compatible; PrismeNewsApp/0.1; personal project)";
const WEEK = 7 * 864e5;
const CHANNELS = [...Object.entries(YOUTUBE).map(([d, id]) => [d, id, null]), ...YOUTUBE_MORE];

async function channel(domain, id, country) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const m = mediaSummary(domain);
    const chName = decode((xml.match(/<title>([^<]*)<\/title>/) || [])[1] || "") || m.name || domain;
    const media = m.known
      ? { known: true, name: m.name, bias: m.bias, country: m.country || country, type: m.type, owner: m.owner, state: m.state || null, domain }
      : { known: false, name: chName, country: m.country || country, domain };
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
      const vid = (e.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
      const title = decode((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
      const published = (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null;
      const isShort = /\/shorts\//.test(e) || /#shorts?\b/i.test(title);
      return vid && { id: vid, title, published, isShort, domain, channel: chName, thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, media };
    }).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Les capsules commerciales (idées cadeaux, contenu commandité…) ne sont pas des nouvelles : on les laisse de côté.
// Seuls des titres clairement promotionnels ; un reportage sur le Black Friday reste.
export const PROMO = /(gift ideas?|gifts? (for|guide|under)|must[- ]have gifts|holiday gifts|stocking stuffers|everyday finds|id[ée]es?[- ](de )?cadeaux|guide (des |de )?cadeaux|cadeaux (de no[eë]l|pour)|deals? (of|du) (the )?(day|jour|week|semaine)|sponsored|sponsoris|commandit|pr[ée]sent[ée]e? par|presented by|brought to you by|paid partnership|partenariat (pay|r[ée]mun)|#ad\b|#sponsored|unboxing|giveaway|product picks|shopping (picks|guide|list))/i;

// Les vidéos de la dernière semaine. Avec « memory » (fichier du robot), celles des passages précédents s'ajoutent.
export async function allVideos({ memory = null } = {}) {
  const lists = [];
  for (let i = 0; i < CHANNELS.length; i += 24) lists.push(...(await Promise.all(CHANNELS.slice(i, i + 24).map(([d, id, c]) => channel(d, id, c)))));
  const byId = new Map();
  if (memory && existsSync(memory)) {
    try { for (const v of JSON.parse(readFileSync(memory, "utf8"))) byId.set(v.id, v); } catch { /* mémoire illisible */ }
  }
  for (const v of lists.flat()) byId.set(v.id, v);
  const out = [...byId.values()].filter((v) => v.published && Date.now() - Date.parse(v.published) < WEEK && !PROMO.test(v.title || ""))
    .sort((a, b) => b.published.localeCompare(a.published));
  if (memory) writeFileSync(memory, JSON.stringify(out));
  return out;
}
export const channelCount = () => CHANNELS.length;
