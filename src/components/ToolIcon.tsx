import type { ReactNode } from "react";

/**
 * One small, consistent icon set drawn inline.
 *
 * Inline SVG rather than an icon font or a package: it costs no extra request,
 * nothing to download before the page is usable, and the whole set is a few
 * hundred bytes after compression — which is the point on a 3G connection.
 */
const PATHS: Record<string, ReactNode> = {
  compress: (
    <>
      <path d="M4 9V6a2 2 0 0 1 2-2h3" />
      <path d="M20 9V6a2 2 0 0 0-2-2h-3" />
      <path d="M4 15v3a2 2 0 0 0 2 2h3" />
      <path d="M20 15v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 12h8" />
    </>
  ),
  merge: (
    <>
      <rect x="3" y="4" width="8" height="11" rx="1.5" />
      <path d="M13 8h5.5A1.5 1.5 0 0 1 20 9.5V19a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 19v-1" />
    </>
  ),
  split: (
    <>
      <rect x="3" y="4" width="8" height="16" rx="1.5" />
      <path d="M15 4h4a1 1 0 0 1 1 1v5" />
      <path d="M15 20h4a1 1 0 0 0 1-1v-5" />
      <path d="M14 12h7" />
    </>
  ),
  imageToPdf: (
    <>
      <rect x="3" y="4" width="12" height="10" rx="1.5" />
      <path d="m5 12 3-3 3 3 2-2" />
      <path d="M12 17h8v4h-8z" />
      <path d="M18 12v3" />
      <path d="m16.5 13.5 1.5 1.5 1.5-1.5" />
    </>
  ),
  pdfToImage: (
    <>
      <rect x="3" y="3" width="10" height="13" rx="1.5" />
      <path d="M11 20h10v-8H11z" />
      <path d="m13 18 2-2 2 2 1.5-1.5" />
      <path d="M6 7h4M6 10h4" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.6" />
      <path d="M20 5v6h-6" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  text: (
    <>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  word: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m9 12 1.2 5L12 13l1.8 4L15 12" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  removeBg: (
    <>
      <path d="M4 4h4M10 4h4M16 4h4M20 8v4M20 14v4M16 20h4M10 20h4M4 20h4M4 14v-4M4 10V8" />
      <path d="M9 15.5c0-2 1.4-3.5 3-3.5s3 1.5 3 3.5" />
      <circle cx="12" cy="9" r="2.2" />
    </>
  ),
  resize: (
    <>
      <rect x="3" y="3" width="12" height="12" rx="1.5" />
      <path d="M9 21h11a1 1 0 0 0 1-1V9" />
      <path d="m18 12 3 3-3 3" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  convert: (
    <>
      <path d="M4 8h13" />
      <path d="m14 5 3 3-3 3" />
      <path d="M20 16H7" />
      <path d="m10 13-3 3 3 3" />
    </>
  ),
  passport: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M8 18c.6-2 2.1-3 4-3s3.4 1 4 3" />
    </>
  ),
  watermark: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h10" opacity="0.45" />
      <path d="M9 11.5h6" opacity="0.45" />
    </>
  ),
  blur: (
    <>
      <circle cx="12" cy="12" r="9" opacity="0.35" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" opacity="0.35" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z" />
    </>
  ),
  qrScan: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M20 8V5a1 1 0 0 0-1-1h-3" />
      <path d="M4 16v3a1 1 0 0 0 1 1h3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M4 12h16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  case: (
    <>
      <path d="m3 18 4.5-12L12 18" />
      <path d="M4.6 14h5.8" />
      <path d="M15 11.5a2.6 2.6 0 1 1 5.2 0V18" />
      <path d="M20.2 14.6c-3.6 0-5.4.7-5.4 2 0 .9.8 1.6 2 1.6 2 0 3.4-1.3 3.4-3" />
    </>
  ),
};

export function ToolIcon({
  name,
  className = "h-5 w-5",
}: {
  name: string;
  className?: string;
}) {
  const path = PATHS[name] ?? PATHS.text;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}
