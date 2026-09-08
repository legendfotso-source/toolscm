"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useObjectUrl } from "@/lib/useObjectUrl";
import type { OptionValues } from "./ToolOptions";
import { cx } from "./ui";

export type Rect = { x: number; y: number; w: number; h: number };
type DragMode = "move" | "nw" | "ne" | "sw" | "se";

const MIN_SIZE = 0.06;

/**
 * A crop frame the user drags with a finger or a mouse.
 *
 * The rectangle is kept as fractions of the image (0–1) rather than screen
 * pixels, so the frame drawn on screen and the pixels actually cut can never
 * drift apart — whatever the preview size or the device.
 *
 * A fixed aspect ratio is applied by *deriving* the displayed rectangle during
 * render rather than by writing corrected values back into state. That keeps
 * one source of truth and means what is framed is always exactly what comes
 * out, with no intermediate frame showing the wrong shape.
 */
export function CropSurface({
  file,
  values,
  setValue,
  /** Width ÷ height of the output in real pixels; null leaves the frame free. */
  ratio,
  caption,
}: {
  file: File | undefined;
  values: OptionValues;
  setValue: (id: string, value: number | string | boolean) => void;
  ratio: number | null;
  caption?: string;
}) {
  const { locale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startRect: Rect;
    startX: number;
    startY: number;
  } | null>(null);

  const url = useObjectUrl(file);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  const stored: Rect = {
    x: Number(values.cropX ?? 0.1),
    y: Number(values.cropY ?? 0.1),
    w: Number(values.cropW ?? 0.8),
    h: Number(values.cropH ?? 0.8),
  };

  // Fractions live in image space, so a pixel ratio has to be converted before
  // it can constrain them.
  const fractionRatio =
    ratio && natural ? ratio / (natural.width / natural.height) : null;

  const rect = applyRatio(stored, fractionRatio);

  const write = useCallback(
    (next: Rect) => {
      setValue("cropX", next.x);
      setValue("cropY", next.y);
      setValue("cropW", next.w);
      setValue("cropH", next.h);
    },
    [setValue],
  );

  const pointFrom = useCallback((event: React.PointerEvent) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }, []);

  const startDrag = useCallback(
    (mode: DragMode) => (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      const point = pointFrom(event);
      dragRef.current = { mode, startRect: rect, startX: point.x, startY: point.y };
    },
    [pointFrom, rect],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();

      const point = pointFrom(event);
      const next = resize(
        drag.mode,
        drag.startRect,
        point.x - drag.startX,
        point.y - drag.startY,
        fractionRatio,
      );
      write(next);
    },
    [pointFrom, fractionRatio, write],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!file || !url) return null;

  const pixelWidth = natural ? Math.round(rect.w * natural.width) : 0;
  const pixelHeight = natural ? Math.round(rect.h * natural.height) : 0;

  return (
    <div>
      <p className="mb-2 text-[13px] text-ink-soft">
        {caption ??
          (locale === "fr"
            ? "Déplacez le cadre, puis tirez les coins pour l'ajuster."
            : "Move the frame, then drag the corners to adjust it.")}
      </p>

      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl border border-line bg-surface-alt"
        // The aspect ratio must hold exactly, otherwise the on-screen frame and
        // the pixels we cut would drift apart. A tall image is therefore
        // limited by width rather than by height.
        style={{
          aspectRatio: natural ? `${natural.width} / ${natural.height}` : "4 / 3",
          maxWidth:
            natural && natural.height > natural.width
              ? `${Math.round(520 * (natural.width / natural.height))}px`
              : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {natural ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-ink/50" />

            {/* The kept area, redrawn undimmed. */}
            <div className="pointer-events-none absolute overflow-hidden" style={frameStyle(rect)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
              <img
                src={url}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{
                  width: `${100 / rect.w}%`,
                  height: `${100 / rect.h}%`,
                  left: `${(-rect.x / rect.w) * 100}%`,
                  top: `${(-rect.y / rect.h) * 100}%`,
                }}
              />
            </div>

            <div
              onPointerDown={startDrag("move")}
              className="absolute cursor-move outline outline-2 outline-white"
              style={frameStyle(rect)}
            >
              <Handle position="nw" onPointerDown={startDrag("nw")} />
              <Handle position="ne" onPointerDown={startDrag("ne")} />
              <Handle position="sw" onPointerDown={startDrag("sw")} />
              <Handle position="se" onPointerDown={startDrag("se")} />
            </div>
          </>
        ) : null}
      </div>

      <p className="mt-2 min-h-5 text-center text-[13px] font-medium tabular-nums text-ink-soft">
        {natural ? `${pixelWidth} × ${pixelHeight} px` : ""}
      </p>
    </div>
  );
}

/**
 * Fit the stored rectangle to a required aspect ratio, keeping it inside the
 * image. Pure, so the frame on screen and the crop we perform are computed the
 * same way from the same numbers.
 */
export function applyRatio(rect: Rect, fractionRatio: number | null): Rect {
  if (!fractionRatio) return rect;

  let w = rect.w;
  let h = w / fractionRatio;
  if (h > 1) {
    h = 1;
    w = h * fractionRatio;
  }
  if (w > 1) {
    w = 1;
    h = w / fractionRatio;
  }
  return {
    w,
    h,
    x: clamp(rect.x, 0, 1 - w),
    y: clamp(rect.y, 0, 1 - h),
  };
}

function resize(
  mode: DragMode,
  start: Rect,
  dx: number,
  dy: number,
  fractionRatio: number | null,
): Rect {
  if (mode === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    };
  }

  const right = start.x + start.w;
  const bottom = start.y + start.h;
  const next: Rect = { ...start };
  const heightFor = (width: number) => (fractionRatio ? width / fractionRatio : null);

  if (mode === "se") {
    next.w = clamp(start.w + dx, MIN_SIZE, 1 - start.x);
    next.h = heightFor(next.w) ?? clamp(start.h + dy, MIN_SIZE, 1 - start.y);
    if (start.y + next.h > 1) {
      next.h = 1 - start.y;
      if (fractionRatio) next.w = next.h * fractionRatio;
    }
  } else if (mode === "sw") {
    next.w = clamp(start.w - dx, MIN_SIZE, right);
    next.h = heightFor(next.w) ?? clamp(start.h + dy, MIN_SIZE, 1 - start.y);
    if (start.y + next.h > 1) {
      next.h = 1 - start.y;
      if (fractionRatio) next.w = next.h * fractionRatio;
    }
    next.x = right - next.w;
  } else if (mode === "ne") {
    next.w = clamp(start.w + dx, MIN_SIZE, 1 - start.x);
    next.h = heightFor(next.w) ?? clamp(start.h - dy, MIN_SIZE, bottom);
    if (next.h > bottom) {
      next.h = bottom;
      if (fractionRatio) next.w = next.h * fractionRatio;
    }
    next.y = bottom - next.h;
  } else {
    next.w = clamp(start.w - dx, MIN_SIZE, right);
    next.h = heightFor(next.w) ?? clamp(start.h - dy, MIN_SIZE, bottom);
    if (next.h > bottom) {
      next.h = bottom;
      if (fractionRatio) next.w = next.h * fractionRatio;
    }
    next.x = right - next.w;
    next.y = bottom - next.h;
  }

  return {
    w: clamp(next.w, MIN_SIZE, 1),
    h: clamp(next.h, MIN_SIZE, 1),
    x: clamp(next.x, 0, 1 - MIN_SIZE),
    y: clamp(next.y, 0, 1 - MIN_SIZE),
  };
}

function frameStyle(rect: Rect): React.CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
}

function Handle({
  position,
  onPointerDown,
}: {
  position: "nw" | "ne" | "sw" | "se";
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const placement: Record<string, string> = {
    nw: "-left-3 -top-3 cursor-nwse-resize",
    ne: "-right-3 -top-3 cursor-nesw-resize",
    sw: "-bottom-3 -left-3 cursor-nesw-resize",
    se: "-bottom-3 -right-3 cursor-nwse-resize",
  };
  return (
    <span
      onPointerDown={onPointerDown}
      // A thumb needs a target this size; a 10px dot is unusable on a phone.
      className={cx(
        "absolute h-7 w-7 rounded-full border-[3px] border-violet-deep bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]",
        placement[position],
      )}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
