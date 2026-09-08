"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadBlob, formatBytes } from "@/lib/files";
import { useObjectUrl } from "@/lib/useObjectUrl";
import type { OutputFile, ToolResult } from "@/types/tool";
import { Button, Notice, cx } from "./ui";

export function ResultCard({
  result,
  onReset,
  originalPreview,
  transparentPreview = false,
}: {
  result: ToolResult;
  onReset: () => void;
  /** Object URL of the input, so image tools can show a real before/after. */
  originalPreview?: string | null;
  transparentPreview?: boolean;
}) {
  const { t, tx, locale } = useLocale();

  const resultBytes = useMemo(
    () => result.files.reduce((sum, file) => sum + file.blob.size, 0),
    [result.files],
  );

  const original = result.originalBytes;
  // Every figure below is measured on the blobs we actually produced.
  const delta =
    original && original > 0 ? Math.round(((original - resultBytes) / original) * 100) : null;

  const single = result.files.length === 1 ? result.files[0] : null;

  return (
    <div className="space-y-4" data-testid="result">
      <div className="rounded-2xl border border-[#bbf7d0] bg-success-light p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-white">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <h2 className="text-[19px] font-bold text-[#166534]">{t("result.done")}</h2>
        </div>

        {original !== undefined && delta !== null ? (
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Stat label={t("result.before")} value={formatBytes(original, locale)} />
            <Stat label={t("result.after")} value={formatBytes(resultBytes, locale)} highlight />
            <Stat
              label=""
              value={
                delta > 0
                  ? t("result.smaller", { percent: delta })
                  : delta < 0
                    ? t("result.larger", { percent: Math.abs(delta) })
                    : t("result.noGain")
              }
              tone={delta > 0 ? "good" : delta < 0 ? "bad" : "neutral"}
            />
          </div>
        ) : result.files.length > 0 ? (
          <p className="mt-2 text-[14px] text-[#166534]">
            {t("upload.fileCount", { count: result.files.length })} ·{" "}
            {formatBytes(resultBytes, locale)}
          </p>
        ) : null}
      </div>

      {result.note ? <Notice tone="warn">{tx(result.note)}</Notice> : null}

      {single && single.kind === "image" ? (
        <ImageComparison
          output={single}
          originalPreview={originalPreview}
          transparent={transparentPreview}
        />
      ) : null}

      {result.text !== undefined ? <TextResult text={result.text} /> : null}

      {result.files.length > 1 ? (
        <FileResults files={result.files} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {result.files.length === 0 ? null : single ? (
          <Button
            size="lg"
            className="flex-1"
            data-testid="download"
            onClick={() => downloadBlob(single.blob, single.name)}
          >
            <DownloadGlyph />
            {t("result.download")}
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-1"
            data-testid="download-all"
            onClick={() => {
              // Browsers throttle simultaneous downloads; stagger them so all
              // of them actually reach the user's storage.
              result.files.forEach((file, index) => {
                setTimeout(() => downloadBlob(file.blob, file.name), index * 350);
              });
            }}
          >
            <DownloadGlyph />
            {t("result.downloadAll")} ({result.files.length})
          </Button>
        )}
        <Button variant="secondary" size="lg" onClick={onReset} className="sm:w-auto">
          {t("result.again")}
        </Button>
      </div>

      {result.files.length > 1 ? (
        <p className="text-center text-[12.5px] text-ink-soft">{t("result.downloadZipNote")}</p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  tone = "neutral",
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl bg-white/70 px-2 py-3">
      {label ? (
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      ) : (
        <p className="text-[11.5px]">&nbsp;</p>
      )}
      <p
        className={cx(
          "mt-0.5 text-[15px] font-bold",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
          tone === "neutral" && (highlight ? "text-ink" : "text-ink"),
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ImageComparison({
  output,
  originalPreview,
  transparent,
}: {
  output: OutputFile;
  originalPreview?: string | null;
  transparent: boolean;
}) {
  const { t } = useLocale();
  const url = useObjectUrl(output.blob);

  if (!url) return null;

  return (
    <div className={cx("grid gap-3", originalPreview ? "grid-cols-2" : "grid-cols-1")}>
      {originalPreview ? (
        <figure>
          <figcaption className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">
            {t("result.originalPreview")}
          </figcaption>
          <div className="overflow-hidden rounded-xl border border-line bg-surface-alt">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
            <img
              src={originalPreview}
              alt=""
              className="mx-auto max-h-64 w-full object-contain"
            />
          </div>
        </figure>
      ) : null}

      <figure>
        <figcaption className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-violet-deep">
          {t("result.resultPreview")}
        </figcaption>
        <div
          className={cx(
            "overflow-hidden rounded-xl border border-violet-border",
            transparent ? "tcm-checker" : "bg-surface-alt",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
          <img src={url} alt="" className="mx-auto max-h-64 w-full object-contain" />
        </div>
        {output.width && output.height ? (
          <p className="mt-1.5 text-center text-[12px] text-ink-soft">
            {output.width} × {output.height} px
          </p>
        ) : null}
      </figure>
    </div>
  );
}

function FileResults({ files }: { files: OutputFile[] }) {
  const { t, locale } = useLocale();
  return (
    <div>
      <h3 className="mb-2 text-[14px] font-semibold text-ink">{t("result.files")}</h3>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-white">
        {files.map((file, index) => (
          <li key={index} className="flex items-center gap-3 p-3">
            <FilePreviewThumb file={file} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-ink">{file.name}</p>
              <p className="text-[12px] text-ink-soft">{formatBytes(file.blob.size, locale)}</p>
            </div>
            <button
              type="button"
              onClick={() => downloadBlob(file.blob, file.name)}
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-violet-deep transition-colors hover:bg-violet-light"
            >
              {t("result.download")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilePreviewThumb({ file }: { file: OutputFile }) {
  const url = useObjectUrl(file.kind === "image" ? file.blob : null);

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-violet-light text-violet-deep">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold uppercase">
          {file.name.split(".").pop()?.slice(0, 4)}
        </span>
      )}
    </div>
  );
}

function TextResult({ text }: { text: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink">{t("result.preview")}</h3>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-violet-deep transition-colors hover:bg-violet-light"
        >
          {copied ? `✓ ${t("common.copied")}` : t("common.copy")}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-alt p-4 text-[13px] leading-6 text-ink">
        {text}
      </pre>
    </div>
  );
}

function DownloadGlyph() {
  return (
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
      <path d="M12 4v12" />
      <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
      <path d="M20 16v2.5A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5V16" />
    </svg>
  );
}
