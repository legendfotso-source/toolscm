"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CLE_NEIGE } from "./Neige";
import { enFetes } from "./saison";

/**
 * Le petit compagnon qui se promène sur le site. On le touche, il ouvre une
 * boîte à idées : une modification, quelque chose à ajouter, un souci… Les
 * messages arrivent dans la console de Répondo (Avis des sites), avec la page
 * d'où ils viennent. Chaque site a son personnage et sa façon de bouger.
 */
export type Mascotte = "bulle" | "sablier" | "cabosse" | "engrenage";

type Props = {
  site: "repondo" | "admis" | "eudr" | "toolscm";
  nom: string;
  mascotte: Mascotte;
  accent: string;
  /** Couleur du texte posé sur l'accent. */
  surAccent?: string;
  cacherSur?: string[];
  /** Pages de travail (formulaires, examens, outils) : le compagnon reste rangé sur le bord, sans se promener. */
  calmeSur?: string[];
};

const T = {
  fr: {
    bulle: "Une idée ? Un souci ? Dites-le-moi",
    ouvrir: "Donner un avis sur le site",
    titre: (n: string) => `Une idée pour ${n} ?`,
    sous: "Une modification, quelque chose à ajouter, un souci, un compliment… Tout est lu.",
    types: [["modification", "Modification"], ["ajout", "À ajouter"], ["probleme", "Un souci"], ["autre", "Autre"]] as const,
    message: "Votre message",
    exemple: "Ex. : ce serait bien de pouvoir…",
    contact: "E-mail ou WhatsApp (facultatif, pour une réponse)",
    envoyer: "Envoyer",
    envoi: "Envoi…",
    merci: "Merci !",
    merciSous: "C'est bien arrivé. On s'en occupe.",
    fermer: "Fermer",
    cacher: "Cacher le compagnon",
    montrer: "Avis",
    neigeOn: "Neige : oui",
    neigeOff: "Neige : non",
    court: "Écrivez au moins quelques mots.",
    erreur: "L'envoi n'a pas marché. Réessayez dans un instant.",
  },
  en: {
    bulle: "An idea? A problem? Tell me",
    ouvrir: "Give feedback on the site",
    titre: (n: string) => `An idea for ${n}?`,
    sous: "A change, something to add, a problem, a compliment… Every message is read.",
    types: [["modification", "Change"], ["ajout", "Add"], ["probleme", "Problem"], ["autre", "Other"]] as const,
    message: "Your message",
    exemple: "E.g. it would be great to…",
    contact: "Email or WhatsApp (optional, for a reply)",
    envoyer: "Send",
    envoi: "Sending…",
    merci: "Thank you!",
    merciSous: "It arrived safely. We're on it.",
    fermer: "Close",
    cacher: "Hide the helper",
    montrer: "Feedback",
    neigeOn: "Snow: on",
    neigeOff: "Snow: off",
    court: "Please write a few words.",
    erreur: "Sending failed. Please try again in a moment.",
  },
};

const CLE_CACHE = "compagnon-cache";
const lireLs = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const ecrireLs = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

/* ───────── Les personnages (SVG 64 × 64) ───────── */

function Bonnet() {
  return (
    <g className="cmp-bonnet" transform="translate(-2 -7) rotate(-8 32 14)">
      <path d="M20 17 C24 3 40 -1 50 6 C46 9 44 13 44 17 Z" fill="#d42a2a" />
      <path d="M50 6 C54 8 56 12 55 15" stroke="#d42a2a" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="55" cy="16" r="4" fill="#fff" />
      <rect x="17" y="15" width="30" height="6.5" rx="3.2" fill="#fff" />
    </g>
  );
}

function Yeux({ y = 30, ecart = 8, cx = 32 }: { y?: number; ecart?: number; cx?: number }) {
  return (
    <g className="cmp-yeux">
      <ellipse cx={cx - ecart} cy={y} rx="3.2" ry="4" fill="#1b1b1f" />
      <ellipse cx={cx + ecart} cy={y} rx="3.2" ry="4" fill="#1b1b1f" />
      <circle cx={cx - ecart + 1.1} cy={y - 1.4} r="1.1" fill="#fff" />
      <circle cx={cx + ecart + 1.1} cy={y - 1.4} r="1.1" fill="#fff" />
    </g>
  );
}

function Personnage({ m, accent, fetes }: { m: Mascotte; accent: string; fetes: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" style={{ overflow: "visible" }}>
      {m === "bulle" && (
        <g className="cmp-corps">
          <path d="M10 18 C10 11 15 8 22 8 H44 C51 8 56 12 56 19 V36 C56 43 51 46 44 46 H28 L17 55 L19 46 C13 45 10 41 10 35 Z" fill={accent} stroke="#1b1b1f" strokeWidth="2.2" strokeLinejoin="round" />
          <Yeux y={24} />
          <g className="cmp-points">
            <circle cx="23" cy="36" r="2.6" fill="#fff" />
            <circle cx="32" cy="36" r="2.6" fill="#fff" />
            <circle cx="41" cy="36" r="2.6" fill="#fff" />
          </g>
        </g>
      )}
      {m === "sablier" && (
        <g className="cmp-corps">
          <rect x="15" y="7" width="34" height="6" rx="3" fill="#7a4b26" stroke="#1b1b1f" strokeWidth="2" />
          <rect x="15" y="51" width="34" height="6" rx="3" fill="#7a4b26" stroke="#1b1b1f" strokeWidth="2" />
          <path d="M19 13 H45 C45 24 36 28 34 32 C36 36 45 40 45 51 H19 C19 40 28 36 30 32 C28 28 19 24 19 13 Z" fill="#eaf6ff" fillOpacity="0.85" stroke="#1b1b1f" strokeWidth="2" />
          <path className="cmp-sable-haut" d="M23 18 H41 C40 24 34 27 32 30 C30 27 24 24 23 18 Z" fill={accent} />
          <path className="cmp-sable-bas" d="M24 50 C25 44 30 42 32 41 C34 42 39 44 40 50 Z" fill={accent} />
          <Yeux y={44} ecart={5} />
        </g>
      )}
      {m === "cabosse" && (
        <g className="cmp-corps">
          <path d="M32 6 C46 6 54 20 54 34 C54 48 44 58 32 58 C20 58 10 48 10 34 C10 20 18 6 32 6 Z" fill="#cf8a3c" stroke="#1b1b1f" strokeWidth="2.2" />
          <path d="M32 7 V57 M22 10 C17 22 17 46 22 56 M42 10 C47 22 47 46 42 56" stroke="#1b1b1f" strokeOpacity="0.28" strokeWidth="1.8" fill="none" />
          <path className="cmp-feuille" d="M32 7 C36 -2 46 -3 50 1 C45 6 39 8 32 7 Z" fill="#3f9b4f" stroke="#1b1b1f" strokeWidth="1.6" />
          <Yeux y={32} ecart={7} />
          <path d="M27 41 Q32 45 37 41" stroke="#1b1b1f" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
      {m === "engrenage" && (
        <g className="cmp-corps">
          <g className="cmp-roue">
            {Array.from({ length: 10 }, (_, i) => (
              <rect key={i} x="28.5" y="2" width="7" height="12" rx="2" fill={accent} stroke="#1b1b1f" strokeWidth="1.8" transform={`rotate(${i * 36} 32 32)`} />
            ))}
            <circle cx="32" cy="32" r="22" fill={accent} stroke="#1b1b1f" strokeWidth="2.2" />
          </g>
          <circle cx="32" cy="32" r="15" fill="#fff" stroke="#1b1b1f" strokeWidth="2" />
          <Yeux y={30} ecart={5} />
          <path d="M28 37 Q32 40 36 37" stroke="#1b1b1f" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
      {fetes && <Bonnet />}
    </svg>
  );
}

const STYLE = `
.cmp-racine{position:fixed;left:0;top:0;z-index:2147483001;will-change:transform;-webkit-tap-highlight-color:transparent}
.cmp-bouton{position:relative;display:block;transform:rotate(var(--cmp-penche,0deg));width:var(--cmp-t);height:var(--cmp-t);border:0;padding:0;background:none;cursor:pointer;filter:drop-shadow(0 6px 10px rgba(0,0,0,.28))}
.cmp-bouton:focus-visible{outline:3px solid var(--cmp-accent);outline-offset:4px;border-radius:50%}
.cmp-flotte{animation:cmp-flotte 3.2s ease-in-out infinite}
@keyframes cmp-flotte{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.cmp-yeux{animation:cmp-cligne 5s infinite;transform-origin:center;transform-box:fill-box}
@keyframes cmp-cligne{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.cmp-points circle{animation:cmp-tape 1.2s infinite ease-in-out}
.cmp-points circle:nth-child(2){animation-delay:.15s}.cmp-points circle:nth-child(3){animation-delay:.3s}
@keyframes cmp-tape{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-3px)}}
.cmp-m-bulle .cmp-corps{animation:cmp-ecrase 2.4s ease-in-out infinite;transform-origin:50% 90%;transform-box:fill-box}
@keyframes cmp-ecrase{0%,100%{transform:scale(1,1)}50%{transform:scale(1.04,.96)}}
.cmp-m-sablier .cmp-corps{animation:cmp-retourne 8s cubic-bezier(.6,0,.3,1) infinite;transform-origin:center;transform-box:fill-box}
@keyframes cmp-retourne{0%,40%{transform:rotate(0)}50%,90%{transform:rotate(180deg)}100%{transform:rotate(360deg)}}
.cmp-m-cabosse .cmp-corps{animation:cmp-balance 2.8s ease-in-out infinite;transform-origin:50% 5%;transform-box:fill-box}
@keyframes cmp-balance{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
.cmp-feuille{animation:cmp-feuille 1.4s ease-in-out infinite;transform-origin:0% 100%;transform-box:fill-box}
@keyframes cmp-feuille{0%,100%{transform:rotate(0)}50%{transform:rotate(-12deg)}}
.cmp-roue{animation:cmp-tourne 9s linear infinite;transform-origin:center;transform-box:fill-box}
@keyframes cmp-tourne{to{transform:rotate(360deg)}}
.cmp-saute .cmp-flotte{animation:cmp-saute .55s cubic-bezier(.3,1.6,.5,1) 3}
@keyframes cmp-saute{0%,100%{transform:translateY(0)}45%{transform:translateY(-22px) rotate(-8deg)}}
.cmp-info{position:absolute;bottom:calc(100% + 10px);right:-6px;white-space:nowrap;max-width:calc(100vw - 32px);background:#fff;color:#1b1b1f;font:600 13px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;padding:8px 11px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);pointer-events:none;animation:cmp-apparait .25s ease-out}
.cmp-info:after{content:"";position:absolute;top:100%;right:28px;border:6px solid transparent;border-top-color:#fff}
[data-cote=g] .cmp-info{right:auto;left:-6px}[data-cote=g] .cmp-info:after{right:auto;left:28px}
@keyframes cmp-apparait{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.cmp-voile{position:fixed;inset:0;z-index:2147483002;background:rgba(15,15,20,.35)}
.cmp-panneau{position:fixed;z-index:2147483003;right:20px;bottom:20px;width:min(380px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow:auto;background:#fff;color:#1b1b1f;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.3);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;animation:cmp-monte .28s cubic-bezier(.2,.9,.3,1)}
@keyframes cmp-monte{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (max-width:640px){.cmp-panneau{left:0;right:0;bottom:0;width:100%;max-height:88dvh;border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom)}}
.cmp-tete{display:flex;gap:12px;align-items:center;padding:18px 18px 0}
.cmp-tete h2{margin:0;font-size:18px;line-height:1.2;font-weight:800;letter-spacing:-.01em}
.cmp-tete p{margin:3px 0 0;font-size:13.5px;color:#5c5c66}
.cmp-mini{flex:0 0 46px;height:46px}
.cmp-corpsp{padding:14px 18px 18px;display:grid;gap:12px}
.cmp-puces{display:flex;flex-wrap:wrap;gap:6px}
.cmp-puce{border:1.5px solid #dcdce3;background:#fff;color:#1b1b1f;border-radius:999px;padding:7px 12px;font:600 13.5px system-ui,sans-serif;cursor:pointer}
.cmp-puce[aria-pressed=true]{border-color:var(--cmp-accent);background:var(--cmp-accent);color:var(--cmp-sur)}
.cmp-champ{width:100%;box-sizing:border-box;border:1.5px solid #dcdce3;border-radius:12px;padding:10px 12px;font:16px/1.4 system-ui,sans-serif;color:#1b1b1f;background:#fff;resize:vertical}
.cmp-champ:focus{outline:none;border-color:var(--cmp-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--cmp-accent) 25%,transparent)}
.cmp-label{font-size:13px;font-weight:600;color:#3d3d47;display:block;margin-bottom:5px}
.cmp-envoyer{border:0;border-radius:12px;min-height:46px;background:var(--cmp-accent);color:var(--cmp-sur);font:700 15px system-ui,sans-serif;cursor:pointer}
.cmp-envoyer:disabled{opacity:.6}
.cmp-bas{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.cmp-lien{border:0;background:none;padding:4px 0;color:#5c5c66;font:600 12.5px system-ui,sans-serif;text-decoration:underline;cursor:pointer}
.cmp-erreur{margin:0;font-size:13.5px;color:#b42318}
.cmp-fermer{margin-left:auto;align-self:flex-start;border:0;background:#f1f1f4;color:#1b1b1f;width:32px;height:32px;border-radius:50%;font-size:18px;line-height:1;cursor:pointer}
.cmp-onglet{position:fixed;right:0;bottom:96px;z-index:2147483001;border:0;border-radius:12px 0 0 12px;background:var(--cmp-accent);color:var(--cmp-sur);font:700 12.5px system-ui,sans-serif;padding:10px 8px 10px 10px;display:flex;align-items:center;gap:6px;box-shadow:0 6px 16px rgba(0,0,0,.25);cursor:pointer}
.cmp-merci{padding:30px 22px 28px;text-align:center}
.cmp-merci .cmp-mini{width:84px;height:84px;margin:0 auto 10px}
.cmp-piege{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
@media print{.cmp-racine,.cmp-onglet,.cmp-panneau,.cmp-voile,.neige-fetes{display:none!important}}
@media (prefers-reduced-motion:reduce){.cmp-racine *,.cmp-panneau *{animation:none!important}}
`;

export function Compagnon({ site, nom, mascotte, accent, surAccent = "#fff", cacherSur = [], calmeSur = [] }: Props) {
  const chemin = usePathname() ?? "/";
  const racine = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLTextAreaElement>(null);
  const [pret, setPret] = useState(false);
  const [cache, setCache] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [info, setInfo] = useState(false);
  const [saute, setSaute] = useState(false);
  const [fetes, setFetes] = useState(false);
  const [neige, setNeige] = useState(true);
  const [type, setType] = useState("modification");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "merci">("saisie");
  const [erreur, setErreur] = useState<string | null>(null);
  const pause = useRef(false);
  useEffect(() => {
    pause.current = ouvert || survol;
  }, [ouvert, survol]);

  // Langue : l'adresse (/en) ou la langue posée sur la page (sites qui changent de langue sans changer d'adresse).
  const l = chemin === "/en" || chemin.startsWith("/en/") || (pret && document.documentElement.lang.startsWith("en")) ? "en" : "fr";
  const t = T[l];
  const sur = (liste: string[]) => liste.some((p) => chemin === p || chemin.startsWith(`${p}/`));
  const masque = sur(cacherSur);
  const calme = sur(calmeSur);

  useEffect(() => {
    // Lecture des préférences gardées dans le navigateur, une fois monté (pas côté serveur).
    /* eslint-disable react-hooks/set-state-in-effect */
    setCache(lireLs(CLE_CACHE) === "1");
    setNeige(lireLs(CLE_NEIGE) !== "1");
    setFetes(enFetes());
    setPret(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    let dejaVu = false;
    try {
      dejaVu = sessionStorage.getItem("compagnon-bonjour") === "1";
      sessionStorage.setItem("compagnon-bonjour", "1");
    } catch {}
    if (dejaVu) return;
    const a = setTimeout(() => setInfo(true), 6000);
    const b = setTimeout(() => setInfo(false), 11500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  // La promenade : un point visé change toutes les 5 à 9 s, le compagnon y glisse avec un ressort doux.
  useEffect(() => {
    if (!pret || cache || masque || calme) return;
    const el = racine.current;
    if (!el) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const taille = () => (window.innerWidth < 640 ? 62 : 78);
    const zoneDe = () => {
      const w = window.innerWidth, h = window.innerHeight, s = taille();
      // Téléphone : seulement le bas de l'écran, pour ne jamais gêner la lecture.
      return w < 640 ? { x0: 12, x1: w - s - 12, y0: h * 0.62, y1: h - s - 90 } : { x0: 24, x1: w - s - 24, y0: 90, y1: h - s - 24 };
    };
    const z0 = zoneDe();
    const pos = { x: z0.x1, y: z0.y1 };
    const vit = { x: 0, y: 0 };
    let cible = { ...pos };
    let prochain = 0;
    let raf = 0, avant = performance.now();
    const viser = (now: number) => {
      const z = zoneDe();
      cible = { x: z.x0 + Math.random() * Math.max(0, z.x1 - z.x0), y: z.y0 + Math.random() * Math.max(0, z.y1 - z.y0) };
      prochain = now + 5000 + Math.random() * 4000;
    };
    const image = (now: number) => {
      const dt = Math.min(0.05, (now - avant) / 1000);
      avant = now;
      if (!reduit && !pause.current) {
        if (now > prochain) viser(now);
        vit.x += (cible.x - pos.x) * 0.6 * dt;
        vit.y += (cible.y - pos.y) * 0.6 * dt;
        vit.x *= 0.965;
        vit.y *= 0.965;
        const v = Math.hypot(vit.x, vit.y), max = 70;
        if (v > max) {
          vit.x *= max / v;
          vit.y *= max / v;
        }
        pos.x += vit.x * dt;
        pos.y += vit.y * dt;
      }
      const z = zoneDe();
      pos.x = Math.min(Math.max(pos.x, 8), z.x1 + 16);
      pos.y = Math.min(Math.max(pos.y, 8), Math.max(z.y1, 8));
      const penche = Math.max(-10, Math.min(10, vit.x * 0.25));
      el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
      el.style.setProperty("--cmp-penche", `${penche.toFixed(1)}deg`);
      el.dataset.cote = pos.x + taille() / 2 < window.innerWidth / 2 ? "g" : "d";
      el.style.setProperty("--cmp-t", `${taille()}px`);
      raf = requestAnimationFrame(image);
    };
    raf = requestAnimationFrame(image);
    return () => cancelAnimationFrame(raf);
  }, [pret, cache, masque, calme]);

  useEffect(() => {
    if (!ouvert) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", f);
    setTimeout(() => zone.current?.focus({ preventScroll: true }), 60);
    return () => window.removeEventListener("keydown", f);
  }, [ouvert]);

  if (!pret || masque) return null;

  const vars = { "--cmp-accent": accent, "--cmp-sur": surAccent } as React.CSSProperties;

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (message.trim().length < 4) return setErreur(t.court);
    setErreur(null);
    setEtat("envoi");
    const piege = (new FormData(e.currentTarget).get("site_web") as string) ?? "";
    try {
      const r = await fetch("/api/avis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site, page: chemin, type, message: message.trim(), contact: contact.trim(), langue: l, piege }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setEtat("merci");
      setMessage("");
      setSaute(true);
      setTimeout(() => setSaute(false), 1800);
    } catch {
      setEtat("saisie");
      setErreur(t.erreur);
    }
  }

  const basculerNeige = () => {
    const n = !neige;
    setNeige(n);
    ecrireLs(CLE_NEIGE, n ? null : "1");
    window.dispatchEvent(new Event("neige-change"));
  };

  return (
    <div style={vars}>
      <style>{STYLE}</style>
      {cache || calme ? (
        <button type="button" className="cmp-onglet" onClick={() => { if (cache) { setCache(false); ecrireLs(CLE_CACHE, null); } setOuvert(true); }} aria-label={t.ouvrir}>
          <span style={{ width: 22, height: 22, display: "inline-block" }} className={`cmp-m-${mascotte}`}>
            <Personnage m={mascotte} accent="#fff" fetes={false} />
          </span>
          {t.montrer}
        </button>
      ) : (
        <div ref={racine} className={`cmp-racine cmp-m-${mascotte} ${saute ? "cmp-saute" : ""}`} style={{ transform: "translate3d(-200px,-200px,0)" }}>
          {(info || survol) && !ouvert && <span className="cmp-info" role="status">{t.bulle}</span>}
          <button type="button" className="cmp-bouton" aria-label={t.ouvrir} aria-haspopup="dialog" aria-expanded={ouvert} onClick={() => { setOuvert((o) => !o); setInfo(false); }} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
            <span className="cmp-flotte" style={{ display: "block", width: "100%", height: "100%" }}>
              <Personnage m={mascotte} accent={accent} fetes={fetes} />
            </span>
          </button>
        </div>
      )}

      {ouvert && (
        <>
          <div className="cmp-voile" onClick={() => setOuvert(false)} aria-hidden="true" />
          <div className="cmp-panneau" role="dialog" aria-modal="true" aria-labelledby="cmp-titre">
            {etat === "merci" ? (
              <div className="cmp-merci">
                <div className={`cmp-mini cmp-m-${mascotte} cmp-saute`}>
                  <span className="cmp-flotte" style={{ display: "block", width: "100%", height: "100%" }}>
                    <Personnage m={mascotte} accent={accent} fetes={fetes} />
                  </span>
                </div>
                <h2 id="cmp-titre" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{t.merci}</h2>
                <p style={{ margin: "6px 0 18px", color: "#5c5c66" }}>{t.merciSous}</p>
                <button type="button" className="cmp-envoyer" style={{ padding: "0 22px" }} onClick={() => { setOuvert(false); setEtat("saisie"); }}>{t.fermer}</button>
              </div>
            ) : (
              <form onSubmit={envoyer}>
                <div className="cmp-tete">
                  <div className={`cmp-mini cmp-m-${mascotte}`}><Personnage m={mascotte} accent={accent} fetes={fetes} /></div>
                  <div>
                    <h2 id="cmp-titre">{t.titre(nom)}</h2>
                    <p>{t.sous}</p>
                  </div>
                  <button type="button" className="cmp-fermer" onClick={() => setOuvert(false)} aria-label={t.fermer}>×</button>
                </div>
                <div className="cmp-corpsp">
                  <div className="cmp-puces" role="group" aria-label="Type">
                    {t.types.map(([k, v]) => (
                      <button key={k} type="button" className="cmp-puce" aria-pressed={type === k} onClick={() => setType(k)}>{v}</button>
                    ))}
                  </div>
                  <label>
                    <span className="cmp-label">{t.message}</span>
                    <textarea ref={zone} className="cmp-champ" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.exemple} />
                  </label>
                  <label>
                    <span className="cmp-label">{t.contact}</span>
                    <input className="cmp-champ" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" />
                  </label>
                  <input className="cmp-piege" name="site_web" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                  {erreur && <p className="cmp-erreur" role="alert">{erreur}</p>}
                  <button className="cmp-envoyer" disabled={etat === "envoi"}>{etat === "envoi" ? t.envoi : t.envoyer}</button>
                  <div className="cmp-bas">
                    <button type="button" className="cmp-lien" onClick={() => { setCache(true); ecrireLs(CLE_CACHE, "1"); setOuvert(false); }}>{t.cacher}</button>
                    {fetes && <button type="button" className="cmp-lien" onClick={basculerNeige}>❄ {neige ? t.neigeOn : t.neigeOff}</button>}
                  </div>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
