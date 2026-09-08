"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useImageObjectUrl } from "@/lib/useObjectUrl";
import { extensionOf, formatBytes } from "@/lib/files";
import { ToolIcon } from "./ToolIcon";
import { cx } from "./ui";

/**
 * Metadata comes from the File object the browser already holds. Nothing is
 * uploaded to show a name, a size or a thumbnail.
 */
export function FileList({
  files,
  onRemove,
  onMove,
  reorderable = false,
}: {
  files: File[];
  onRemove: (index: number) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  reorderable?: boolean;
}) {
  const { t, locale } = useLocale();
  if (files.length === 0) return null;

  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-ink">{t("upload.selectedFiles")}</h2>
        <p className="text-[12.5px] text-ink-soft">
          {t("upload.fileCount", { count: files.length })} · {formatBytes(total, locale)}
        </p>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {files.map((file, index) => (
          <li key={`${file.name}-${index}-${file.lastModified}`} className="flex items-center gap-3 p-3">
            <Thumbnail file={file} index={index} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink" title={file.name}>
                {file.name}
              </p>
              <p className="text-[12.5px] text-ink-soft">
                {formatBytes(file.size, locale)} ·{" "}
                <span className="uppercase">{extensionOf(file.name) || "?"}</span>
              </p>
            </div>

            {reorderable && onMove && files.length > 1 ? (
              <div className="flex shrink-0 items-center">
                <IconButton
                  label={t("upload.moveUp")}
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  <path d="m6 15 6-6 6 6" />
                </IconButton>
                <IconButton
                  label={t("upload.moveDown")}
                  disabled={index === files.length - 1}
                  onClick={() => onMove(index, 1)}
                >
                  <path d="m6 9 6 6 6-6" />
                </IconButton>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`${t("upload.remove")} ${file.name}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-danger-light hover:text-danger"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function Thumbnail({ file, index }: { file: File; index: number }) {
  const isImage = file.type.startsWith("image/");
  const url = useImageObjectUrl(file);

  return (
    <div
      className={cx(
        "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        isImage ? "bg-surface-alt" : "bg-violet-light text-violet-deep",
      )}
    >
      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, never a remote asset
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ToolIcon name="word" className="h-5 w-5" />
      )}
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-ink/70 px-1 text-[10px] font-semibold text-white">
        {index + 1}
      </span>
    </div>
  );
}
