export const UA = "PrismeNewsApp/0.1 (personal project)";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Code d'accès partagé : si ACCESS_CODE est défini, chaque appel doit l'envoyer.
export function checkAccess(req) {
  const code = process.env.ACCESS_CODE;
  if (!code) return null;
  if (req.headers.get("x-access-code") === code) return null;
  return json({ error: "access", message: "Code d'accès requis" }, 401);
}

const store = new Map();
const pending = new Map();
// Cache en mémoire ; deux demandes simultanées pour la même clé partagent le même calcul.
export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, exp: Date.now() + ttlMs });
      if (store.size > 500) store.delete(store.keys().next().value);
      return value;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, p);
  return p;
}

export async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}
