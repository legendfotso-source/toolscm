"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { acceptAttribute, formatBytes } from "@/lib/files";
import type { ToolDefinition } from "@/types/tool";
import { buttonClass, cx } from "./ui";

export function UploadZone({
  tool,
  onFiles,
  compact = false,
}: {
  tool: ToolDefinition;
  onFiles: (files: File[]) => void;
  compact?: boolean;
}) {
  const { t, locale } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  const openPicker = () => inputRef.current?.click();

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          data-testid="file-input-more"
          accept={acceptAttribute(tool)}
          multiple={tool.multiple}
          className="sr-only"
          onChange={(event) => {
            handle(event.target.files);
            event.target.value = "";
          }}
        />
        <button type="button" onClick={openPicker} className={buttonClass("secondary", "md")}>
          <PlusGlyph />
          {t("upload.addMore")}
        </button>
      </>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handle(event.dataTransfer.files);
      }}
      className={cx(
        "relative rounded-2xl border-2 border-dashed px-5 py-10 text-center transition-colors sm:py-14",
        dragging
          ? "border-violet-mid bg-violet-light"
          : "border-[#d8d4e4] bg-surface-alt hover:border-violet-mid hover:bg-violet-light/60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        data-testid="file-input"
        accept={acceptAttribute(tool)}
        multiple={tool.multiple}
        className="sr-only"
        onChange={(event) => {
          handle(event.target.files);
          // Reset so choosing the same file twice still fires a change event.
          event.target.value = "";
        }}
      />

      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-violet-deep shadow-[0_1px_2px_rgba(24,24,27,0.06)]"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
        >
          <path d="M12 16V4" />
          <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
          <path d="M20 15v3.5A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5V15" />
        </svg>
      </div>

      <p className="mt-4 text-[17px] font-semibold text-ink">
        {tool.multiple ? t("upload.dropHereMulti") : t("upload.dropHere")}
      </p>
      <p className="mt-1 text-[13.5px] text-ink-soft">{t("upload.or")}</p>

      <button
        type="button"
        onClick={openPicker}
        className={buttonClass("primary", "lg", "mt-4 w-full sm:w-auto")}
      >
        {tool.multiple ? t("upload.chooseFiles") : t("upload.chooseFile")}
      </button>

      <p className="mt-4 text-[12.5px] text-ink-soft">
        {t("upload.limitLine", {
          formats: tool.formatsLabel,
          size: formatBytes(tool.maxFileSize, locale),
        })}
      </p>
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
