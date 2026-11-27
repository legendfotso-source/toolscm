"use client";

import { useEffect, useRef, useState } from "react";

import { enFetes } from "./saison";

export const CLE_NEIGE = "neige-coupee";

/**
 * La neige des fêtes, sur toutes les pages : des flocons qui tombent sans
 * s'arrêter, au-dessus du contenu mais sans jamais gêner un clic. Légère
 * (un seul canevas, en pause quand l'onglet est caché), coupée si le visiteur
 * a demandé moins d'animations, et désactivable depuis le petit compagnon.
 */
export function Neige() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const lire = () => {
      let coupee = false;
      try {
        coupee = localStorage.getItem(CLE_NEIGE) === "1";
      } catch {}
      setActive(enFetes() && !coupee && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    };
    lire();
    window.addEventListener("neige-change", lire);
    return () => window.removeEventListener("neige-change", lire);
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!active || !c) return;
    const g = c.getContext("2d")!;
    let w = 0, h = 0, dpr = 1;
    type F = { x: number; y: number; r: number; v: number; o: number; p: number; d: number };
    let flocons: F[] = [];
    const nouveau = (haut = false): F => ({ x: Math.random() * w, y: haut ? -10 - Math.random() * h * 0.2 : Math.random() * h, r: 0.8 + Math.random() * 2.4, v: 18 + Math.random() * 42, o: 0.35 + Math.random() * 0.5, p: Math.random() * 6.28, d: 8 + Math.random() * 22 });
    const taille = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, Math.max(36, (w * h) / 14000)));
      flocons = Array.from({ length: n }, () => nouveau());
    };
    taille();
    window.addEventListener("resize", taille);
    let raf = 0, avant = performance.now();
    const image = (t: number) => {
      const dt = Math.min(0.05, (t - avant) / 1000);
      avant = t;
      g.clearRect(0, 0, w, h);
      for (const f of flocons) {
        f.y += f.v * dt;
        f.x += Math.sin(t / 1000 + f.p) * f.d * dt;
        if (f.y > h + 8) Object.assign(f, nouveau(true));
        g.beginPath();
        g.arc(f.x, f.y, f.r, 0, 6.283);
        // Blanc bordé d'un léger gris bleu : visible sur les fonds sombres comme sur les fonds clairs.
        g.fillStyle = `rgba(255,255,255,${f.o + 0.1})`;
        g.fill();
        g.lineWidth = 0.8;
        g.strokeStyle = `rgba(120,140,175,${f.o * 0.55})`;
        g.stroke();
      }
      raf = requestAnimationFrame(image);
    };
    const visibilite = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible") {
        avant = performance.now();
        raf = requestAnimationFrame(image);
      }
    };
    raf = requestAnimationFrame(image);
    document.addEventListener("visibilitychange", visibilite);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", taille);
      document.removeEventListener("visibilitychange", visibilite);
    };
  }, [active]);

  if (!active) return null;
  return <canvas ref={ref} aria-hidden="true" className="neige-fetes" style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 2147483000 }} />;
}
