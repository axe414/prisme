// Résumé neutre d'une histoire, écrit à partir des titres de gauche, du centre et de droite.
// Optionnel : actif seulement si une clé est configurée.
//   GEMINI_API_KEY    → Gemini (palier gratuit de Google ; modèle réglable avec GEMINI_MODEL)
//   ANTHROPIC_API_KEY → Claude (payant à l'usage, environ 1 ¢ par résumé)
// Une clé copiée-collée peut traîner un caractère invisible (marque d'encodage, espace) : on la nettoie.
for (const k of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_MODEL"]) {
  if (process.env[k]) process.env[k] = process.env[k].replace(/^﻿/, "").trim();
}

const SIDE = (m) => (!m?.known ? "autre" : m.bias === null || m.bias === undefined ? "état" : m.bias < 0 ? "gauche" : m.bias > 0 ? "droite" : "centre");

const SYSTEM = `Tu es un rédacteur de presse rigoureux et neutre. On te donne les titres (et parfois un court extrait) que plusieurs médias ont publiés sur une même histoire, avec l'orientation de chaque média.
Réponds en français, en trois lignes exactement, sans rien d'autre :
RÉSUMÉ: deux ou trois phrases factuelles et neutres sur ce qui s'est passé, sans adjectifs chargés, en ne t'appuyant que sur ce que les titres disent.
GAUCHE: une phrase sur ce que les médias de gauche mettent de l'avant (angle, mots, enjeux). Écris « Aucun média de gauche dans l'échantillon. » s'il n'y en a pas.
DROITE: une phrase sur ce que les médias de droite mettent de l'avant. Écris « Aucun média de droite dans l'échantillon. » s'il n'y en a pas.`;

function promptFor(story) {
  const lines = story.articles.slice(0, 30).map((a) => `- [${SIDE(a.media)}] ${a.sourceName} : ${a.title}${a.summary ? ` — ${String(a.summary).slice(0, 220)}` : ""}`);
  return `Histoire : ${story.title}\n\nCouverture :\n${lines.join("\n")}`;
}

function parse(raw) {
  // Le modèle met parfois les étiquettes en gras (**RÉSUMÉ** :) ou ajoute des titres : on nettoie d'abord.
  const text = raw.replace(/[*#_]+/g, "").replace(/\r/g, "");
  const LABELS = "R[ÉE]SUM[ÉE](?:\\s+NEUTRE)?|GAUCHE|DROITE";
  const get = (label) => {
    const m = text.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：-]\\s*([\\s\\S]*?)(?=\\n\\s*(?:${LABELS})\\s*[:：-]|$)`, "i"));
    return m ? m[1].replace(/\s+/g, " ").trim() || null : null;
  };
  return { summary: get("R[ÉE]SUM[ÉE](?:\\s+NEUTRE)?"), left: get("GAUCHE"), right: get("DROITE") };
}

async function withClaude(story) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: promptFor(story) }],
  });
  if (response.stop_reason === "refusal") throw new Error("le modèle a refusé de résumer cette histoire");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { ...parse(text), provider: "Claude" };
}

// Flash-Lite d'abord : c'est le modèle qui a le plus gros quota gratuit (environ 500 résumés par jour).
// Si un modèle est retiré par Google (404) ou surchargé (5xx), on essaie le suivant.
const GEMINI_MODELS = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter(Boolean))];

function callGemini(model, story, fast) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: promptFor(story) }] }],
      // Pas besoin de « réfléchir » pour résumer des titres : réponse directe.
      ...(fast ? { generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } } } : {}),
    }),
  });
}

async function withGemini(story) {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    let res = await callGemini(model, story, true);
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      if (/api key/i.test(body.error?.message || "")) throw new Error("la clé Gemini est refusée");
      res = await callGemini(model, story, false); // modèle qui ne connaît pas ce réglage
    }
    if (res.status === 404 || res.status >= 500) { lastStatus = res.status; continue; }
    if (res.status === 429) throw Object.assign(new Error("le quota gratuit de Gemini est atteint pour aujourd'hui (il revient à minuit, heure du Pacifique)"), { quota: true });
    if (res.status === 400 || res.status === 403) throw new Error("la clé Gemini est refusée");
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
    const out = parse(text);
    if (!out.summary && !out.left) throw new Error("réponse illisible, réessaie plus tard");
    return { ...out, provider: "Gemini" };
  }
  throw new Error(lastStatus >= 500 ? "Gemini est surchargé en ce moment, réessaie dans quelques minutes" : "aucun modèle Gemini disponible");
}

// Traduit des titres en français (un seul appel pour toute la liste). Gemini seulement (palier gratuit).
export async function translateTitles(titles) {
  if (!process.env.GEMINI_API_KEY || !titles.length) return [];
  const prompt = `Traduis chaque titre de presse en français du Québec, fidèlement et sans rien ajouter. Garde les noms propres. Réponds uniquement avec un tableau JSON de chaînes, dans le même ordre.\n\n${JSON.stringify(titles)}`;
  for (const model of GEMINI_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (res.status === 404 || res.status >= 500) continue;
    if (res.status === 429) throw Object.assign(new Error("quota Gemini atteint"), { quota: true });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const out = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    if (!Array.isArray(out) || out.length !== titles.length) throw new Error("réponse de traduction incomplète");
    return out.map((t) => String(t || "").trim());
  }
  throw new Error("aucun modèle Gemini disponible");
}

export const canSummarize = () => !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
export const summarize = (story) => (process.env.GEMINI_API_KEY ? withGemini(story) : withClaude(story));
