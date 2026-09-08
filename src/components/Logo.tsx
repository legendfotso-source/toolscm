import Link from "next/link";

/**
 * The mark is a document corner with a violet fold — a file, not a wrench,
 * because the promise is about the user's own files.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#6D28D9" />
      <path
        d="M12 8.5h5.6L22 12.9V22a1.5 1.5 0 0 1-1.5 1.5h-8.5A1.5 1.5 0 0 1 10.5 22V10a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      <path d="M17.4 8.5 22 13.1h-3.6a1 1 0 0 1-1-1V8.5Z" fill="#C4B5FD" />
      <path
        d="M13.6 16.4h5M13.6 19.2h3.2"
        stroke="#6D28D9"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  markClassName = "h-8 w-8",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <Link
      href="/"
      className={`flex shrink-0 items-center gap-2 rounded-lg ${className ?? ""}`}
      aria-label="Tools.cm — accueil"
    >
      <LogoMark className={markClassName} />
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
        Tools<span className="text-violet-deep">.cm</span>
      </span>
    </Link>
  );
}
