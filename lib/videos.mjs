// Les dernières vidéos des chaînes YouTube des médias, lues par leurs flux RSS publics (aucune clé, aucun quota).
import { YOUTUBE } from "./sources.mjs";
import { mediaSummary } from "./media-db.mjs";
import { decode } from "./news.mjs";

const UA = "Mozilla/5.0 (compatible; PrismeNewsApp/0.1; personal project)";

async function channel(domain, id) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const m = mediaSummary(domain);
    const media = m.known ? { known: true, name: m.name, bias: m.bias, country: m.country, type: m.type, owner: m.owner, state: m.state || null, domain } : { known: false, country: m.country, domain };
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
      const vid = (e.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
      const title = decode((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
      const published = (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null;
      const isShort = /\/shorts\//.test(e) || /#shorts?\b/i.test(title);
      return vid && { id: vid, title, published, isShort, domain, channel: m.name || domain, thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, media };
    }).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Toutes les vidéos de la dernière semaine, des plus récentes aux plus anciennes.
export async function allVideos() {
  const lists = await Promise.all(Object.entries(YOUTUBE).map(([d, id]) => channel(d, id)));
  return lists.flat().filter((v) => v.published && Date.now() - Date.parse(v.published) < 7 * 864e5)
    .sort((a, b) => b.published.localeCompare(a.published));
}
