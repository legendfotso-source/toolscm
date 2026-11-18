"use client";

import Link from "next/link";

/** The top of an inner page: an eyebrow, a large title, one sentence. */
export function PageHead({
  eyebrow,
  title,
  text,
  number,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  number?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-violet-light to-white">
      {number ? (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[0.18em] right-2 select-none text-[34vw] font-black leading-none tracking-[-0.07em] text-violet-deep/[0.06] sm:text-[20vw]"
        >
          {number}
        </p>
      ) : null}
      <div className="container-page relative pb-14 pt-12 sm:pb-20 sm:pt-16">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-violet-deep">{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-[clamp(2.1rem,5vw,3.9rem)] font-extrabold leading-[1] tracking-[-0.04em] text-ink">
          {title}
        </h1>
        {text ? <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-soft">{text}</p> : null}
      </div>
    </section>
  );
}

/** One door to the next page. */
export function NextStep({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <section className="container-page pb-4 pt-16 sm:pt-20">
      <div className="flex flex-col gap-6 rounded-3xl bg-[#1e1240] px-6 py-10 text-white sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-12">
        <p className="max-w-xl text-[clamp(1.6rem,3vw,2.3rem)] font-extrabold leading-tight tracking-[-0.03em]">{title}</p>
        <Link
          href={href}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-white px-7 font-bold text-violet-deep transition hover:bg-violet-light"
        >
          {label} <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </div>
    </section>
  );
}
