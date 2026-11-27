const SITE = "toolscm";

/**
 * Boîte à idées du site : reçoit l'avis du petit compagnon et le transmet,
 * de serveur à serveur, à la console de Répondo qui regroupe les avis de
 * tous les sites. Rien ne part du navigateur vers un autre domaine.
 */
export const dynamic = "force-dynamic";

const fenetres = new Map<string, number[]>();
function autoriser(cle: string, max: number, ms: number) {
  const now = Date.now();
  const r = (fenetres.get(cle) ?? []).filter((t) => now - t < ms);
  if (r.length >= max) return false;
  r.push(now);
  fenetres.set(cle, r);
  if (fenetres.size > 5000) fenetres.clear();
  return true;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
  if (!autoriser(ip, 6, 10 * 60_000)) return Response.json({ erreur: "trop de messages" }, { status: 429 });
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!c || typeof c.message !== "string" || c.message.trim().length < 4 || c.message.length > 2000) return Response.json({ erreur: "message invalide" }, { status: 400 });
  if (c.piege) return Response.json({ ok: true }); // robot : on fait semblant
  const r = await fetch(process.env.AVIS_URL?.trim() || "https://repondo-xi.vercel.app/api/avis", {
    method: "POST",
    headers: { "content-type": "application/json", "x-avis-ip": ip, "x-avis-appareil": (req.headers.get("user-agent") ?? "").slice(0, 200) },
    body: JSON.stringify({ site: SITE, page: c.page, type: c.type, message: c.message, contact: c.contact, langue: c.langue }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r?.ok) return Response.json({ erreur: "boîte à idées indisponible" }, { status: 502 });
  return Response.json({ ok: true });
}
