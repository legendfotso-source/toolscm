"use client";

import { useEffect, useMemo } from "react";

/**
 * A blob URL that lives exactly as long as the blob it points at.
 *
 * Written as a memo plus a cleanup effect rather than state-set-in-an-effect:
 * the URL is available on the first render, so previews do not flash empty,
 * and every URL is revoked when it is replaced or the component unmounts —
 * which matters here, because these blobs are whole PDFs and photographs held
 * in the memory of a phone that does not have much of it.
 */
export function useObjectUrl(source: Blob | null | undefined): string | null {
  const url = useMemo(() => (source ? URL.createObjectURL(source) : null), [source]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

/** The same, but only for sources that are images. */
export function useImageObjectUrl(source: File | Blob | null | undefined): string | null {
  const image = source && "type" in source && source.type.startsWith("image/") ? source : null;
  return useObjectUrl(image);
}
