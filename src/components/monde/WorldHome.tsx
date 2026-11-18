"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { popularTools, usableTools } from "@/lib/tools/registry";
import { ToolGrid } from "@/components/ToolGrid";
import { ToolSearch } from "@/components/ToolSearch";
import { LockGlyph } from "@/components/home/Sections";

const Monde3D = dynamic(() => import("./Monde3D"), { ssr: false });

/**
 * The homepage: a 3D scene fixed behind the page, a background that changes
 * colour per section, and a giant word. Five beats — the mark, the problem,
 * the solution, the tools, the next step.
 *
 * The 3D only loads on capable devices with data saving off. Everyone else
 * gets the drawn mark: this site is used on small phones and metered data.
 */
const BACKGROUNDS = ["#f3f0ff", "#0d0a1a", "#2e1065", "#120d24", "#4c1d95"];

function hex(c: string) {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
function colourAt(s: number) {
  const i = Math.min(BACKGROUNDS.length - 2, Math.max(0, Math.floor(s)));
  const f = Math.min(1, Math.max(0, s - i));
  const a = hex(BACKGROUNDS[i]);
  const b = hex(BACKGROUNDS[i + 1]);
  const t = f * f * (3 - 2 * f);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(",")})`;
}

function modestDevice() {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2 || n.connection?.saveData === true;
}

const display = "font-extrabold leading-[0.98] tracking-[-0.04em]";

export function WorldHome() {
  const { t } = useLocale();
  const state = useRef(0);
  const bg = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const modest = useSyncExternalStore(
    () => () => {},
    () => modestDevice(),
    () => null,
  );
  const [failed, setFailed] = useState(false);
  const with3d = modest === false && !failed;

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      // Progress measured 30 % down the screen; the first section starts at 0.
      const ref = window.innerHeight * 0.3;
      let s = 0;
      document.querySelectorAll<HTMLElement>("[data-scene]").forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const p = i === 0 ? -r.top / Math.max(1, r.height - ref) : (ref - r.top) / r.height;
        if (i === 0 || r.top <= ref) s = i + Math.min(0.999, Math.max(0, p));
      });
      state.current = s;
      if (bg.current) bg.current.style.background = colourAt(s);
      if (word.current) {
        word.current.style.opacity = String(Math.max(0, 1 - s * 1.6));
        word.current.style.transform = `translateY(${s * -80}px)`;
      }
      document.documentElement.dataset.bg = s < 0.55 ? "light" : "dark";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      delete document.documentElement.dataset.bg;
    };
  }, []);

  const points: Array<[string, string]> = [
    [t("world.p1"), t("world.p1Text")],
    [t("world.p2"), t("world.p2Text")],
    [t("world.p3"), t("world.p3Text")],
  ];

  return (
    <>
      <div ref={bg} className="fixed inset-0 -z-30" style={{ background: BACKGROUNDS[0] }} aria-hidden="true" />
      <div
        ref={word}
        className="pointer-events-none fixed inset-x-0 top-[13vh] -z-20 select-none text-center text-[31vw] font-black leading-none tracking-[-0.07em] text-transparent [-webkit-text-stroke:2px_#1e1240] md:[-webkit-text-stroke:3px_#1e1240] md:bottom-[-1.5vw] md:top-auto md:text-[19vw]"
        aria-hidden="true"
      >
        {t("world.word")}
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        {with3d && <Monde3D state={state} onFail={() => setFailed(true)} />}
        {!with3d && modest !== null && <StaticMark />}
      </div>

      {/* 0 · The mark, on lavender. The search stays the way in. */}
      <section data-scene="0" className="relative min-h-svh text-ink">
        <div className="container-page grid min-h-[calc(100svh-4rem)] content-end pb-12 pt-10 md:content-start md:pb-[26vw] md:pt-16">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-violet-deep">
              <LockGlyph />
              {t("world.eyebrow")}
            </p>
            <h1 className={`mt-5 text-[clamp(2.3rem,5.4vw,4.4rem)] ${display}`}>{t("home.heroTitle")}</h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink/70">{t("home.heroSubtitle")}</p>
            <div className="mt-7 max-w-lg">
              <ToolSearch />
              <p className="mt-2 text-[12.5px] text-ink/60">{t("home.searchHint")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 1 · The problem. */}
      <section data-scene="1" className="relative flex min-h-[150svh] items-center text-white">
        <div className="container-page sticky top-0 flex min-h-svh items-end pb-16 md:items-center md:pb-0">
          <div className="max-w-xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#ff8a9a]">{t("world.problemEyebrow")}</p>
            <h2 className={`mt-5 text-[clamp(2.2rem,5vw,4.3rem)] ${display}`}>{t("world.problemTitle")}</h2>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/70">{t("world.problemText")}</p>
            <Link href="/comment-ca-marche" className="mt-8 inline-flex items-center gap-2 font-semibold text-[#ff8a9a] underline-offset-4 hover:underline">
              {t("world.problemLink")} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 2 · The solution. */}
      <section data-scene="2" className="relative flex min-h-[150svh] items-center text-white">
        <div className="container-page sticky top-0 flex min-h-svh items-end pb-16 md:items-center md:pb-0">
          <div className="max-w-xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#c4b5fd]">{t("world.solutionEyebrow")}</p>
            <h2 className={`mt-5 text-[clamp(2.2rem,5vw,4.3rem)] ${display}`}>{t("world.solutionTitle")}</h2>
            <dl className="mt-10 grid gap-6 sm:grid-cols-3 md:max-w-2xl">
              {points.map(([a, b]) => (
                <div key={a} className="min-w-0 border-t border-white/25 pt-4">
                  <dt className="text-[17px] font-bold">{a}</dt>
                  <dd className="mt-1.5 text-[14.5px] leading-relaxed text-white/70">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* 3 · The tools people use most. */}
      <section data-scene="3" className="relative py-28 text-white md:py-40">
        <div className="container-page">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#c4b5fd]">{t("world.toolsEyebrow")}</p>
          <h2 className={`mt-5 max-w-3xl text-[clamp(2.1rem,4.6vw,3.7rem)] ${display}`}>{t("world.toolsTitle")}</h2>
          <div className="mt-12">
            <ToolGrid tools={popularTools()} />
          </div>
          <Link href="/outils" className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-6 font-semibold transition hover:border-white/60">
            {t("world.allTools", { n: usableTools().length })} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* 4 · Next step. */}
      <section data-scene="4" className="relative flex min-h-svh items-end pb-24 text-white md:items-center">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#ddd6fe]">{t("world.endEyebrow")}</p>
            <h2 className={`mt-5 text-[clamp(2.2rem,5vw,4.2rem)] ${display}`}>{t("world.endTitle")}</h2>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/75">{t("world.endText")}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/outils" className="inline-flex min-h-12 items-center rounded-full bg-white px-7 font-bold text-violet-deep transition hover:bg-violet-light">
                {t("world.endCta1")} →
              </Link>
              <Link href="/comment-ca-marche" className="inline-flex min-h-12 items-center rounded-full border border-white/30 px-7 font-semibold transition hover:border-white/70">
                {t("world.endCta2")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** Without 3D: the mark, drawn, still. */
function StaticMark() {
  return (
    <div className="absolute inset-0 flex items-start justify-center pt-[16vh] md:items-center md:justify-end md:pr-[12vw] md:pt-0">
      <svg viewBox="0 0 32 32" className="w-[38vw] max-w-[320px] drop-shadow-[0_30px_40px_rgba(46,16,101,.35)]" aria-hidden="true">
        <path d="M12 8.5h5.6L22 12.9V22a1.5 1.5 0 0 1-1.5 1.5h-8.5A1.5 1.5 0 0 1 10.5 22V10a1.5 1.5 0 0 1 1.5-1.5Z" fill="#8b5cf6" />
        <path d="M17.4 8.5 22 13.1h-3.6a1 1 0 0 1-1-1V8.5Z" fill="#ddd6fe" />
        <path d="M13.6 16.4h5M13.6 19.2h3.2" stroke="#2e1065" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
