"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ToolDefinition } from "@/types/tool";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ButtonLink, Notice } from "./ui";
import { useAuthUser } from "@/lib/useAuthUser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { accountRequired } from "@/lib/auth/access";
import { SignInRequired } from "./SignInRequired";

type RunnerProps = { tool: ToolDefinition };

/** A skeleton the size of the upload zone, so the page does not jump. */
function Loading() {
  return (
    <div className="animate-pulse rounded-2xl border-2 border-dashed border-line bg-surface-alt px-5 py-14" />
  );
}

/**
 * Every tool's implementation is loaded on demand.
 *
 * This is the single most important performance decision on the site: pdf-lib,
 * pdf.js and the segmentation model together weigh several megabytes, and none
 * of them belong in the bundle of someone who is only browsing the homepage.
 */
const RUNNERS: Record<string, ComponentType<RunnerProps>> = {
  "compress-pdf": dynamic(() => import("./tools/CompressPdf"), { loading: Loading }),
  "merge-pdf": dynamic(() => import("./tools/MergePdf"), { loading: Loading }),
  "split-pdf": dynamic(() => import("./tools/SplitPdf"), { loading: Loading }),
  "jpg-to-pdf": dynamic(() => import("./tools/JpgToPdf"), { loading: Loading }),
  "pdf-to-jpg": dynamic(() => import("./tools/PdfToJpg"), { loading: Loading }),
  "rotate-pdf": dynamic(() => import("./tools/RotatePdf"), { loading: Loading }),
  "delete-pdf-pages": dynamic(() => import("./tools/DeletePdfPages"), { loading: Loading }),
  "extract-text-pdf": dynamic(() => import("./tools/ExtractTextPdf"), { loading: Loading }),
  "protect-pdf": dynamic(() => import("./tools/ProtectPdf"), { loading: Loading }),
  "unlock-pdf": dynamic(() => import("./tools/UnlockPdf"), { loading: Loading }),
  "pdf-to-word": dynamic(() => import("./tools/PdfToWord"), { loading: Loading }),
  "word-to-pdf": dynamic(() => import("./tools/WordToPdf"), { loading: Loading }),

  "remove-background": dynamic(() => import("./tools/RemoveBackground"), { loading: Loading }),
  "blur-background": dynamic(() => import("./tools/BlurBackground"), { loading: Loading }),
  "compress-image": dynamic(() => import("./tools/CompressImage"), { loading: Loading }),
  "resize-image": dynamic(() => import("./tools/ResizeImage"), { loading: Loading }),
  "crop-image": dynamic(() => import("./tools/CropImage"), { loading: Loading }),
  "jpg-to-png": dynamic(() => import("./tools/ConvertImage"), { loading: Loading }),
  "png-to-jpg": dynamic(() => import("./tools/ConvertImage"), { loading: Loading }),
  "passport-photo": dynamic(() => import("./tools/PassportPhoto"), { loading: Loading }),
  "watermark-image": dynamic(() => import("./tools/WatermarkImage"), { loading: Loading }),

  "qr-generator": dynamic(() => import("./tools/QrGenerator"), { loading: Loading }),
  "qr-reader": dynamic(() => import("./tools/QrReader"), { loading: Loading }),
  "word-counter": dynamic(
    () => import("./tools/TextTools").then((module) => module.WordCounterTool),
    { loading: Loading },
  ),
  "case-converter": dynamic(
    () => import("./tools/TextTools").then((module) => module.CaseConverterTool),
    { loading: Loading },
  ),
  "age-calculator": dynamic(
    () => import("./tools/TextTools").then((module) => module.AgeCalculatorTool),
    { loading: Loading },
  ),
};

/** True when a tool id has a real implementation behind it. */
export function hasRunner(id: string): boolean {
  return id in RUNNERS;
}

export function ToolRunner({ tool }: RunnerProps) {
  const { t } = useLocale();
  const Runner = RUNNERS[tool.id];

  // A tool marked COMING_SOON, or one whose implementation is not wired up,
  // says so plainly. It never renders a form that pretends to work.
  if (!Runner || tool.status === "COMING_SOON") {
    return (
      <Notice tone="warn">
        <p className="font-semibold">{t("status.comingSoon")}</p>
        <p className="mt-1">{t("status.comingSoonNote")}</p>
        <ButtonLink href="/" variant="secondary" className="mt-3">
          {t("status.notifyMe")}
        </ButtonLink>
      </Notice>
    );
  }

  return <SignedInOnly tool={tool} Runner={Runner} />;
}

/**
 * The tool, for signed-in visitors only.
 *
 * The check happens before the tool's code is loaded: `Runner` is a lazy
 * import, so a signed-out visitor never downloads pdf-lib or the segmentation
 * model for a tool they cannot use. While the session is still being read the
 * skeleton stays up, so a signed-in visitor never sees the sign-in panel flash.
 */
function SignedInOnly({
  tool,
  Runner,
}: {
  tool: ToolDefinition;
  Runner: ComponentType<RunnerProps>;
}) {
  const auth = useAuthUser();

  if (!accountRequired(isSupabaseConfigured())) return <Runner tool={tool} />;
  if (!auth.known) return <Loading />;
  if (!auth.user) return <SignInRequired path={`/tool/${tool.id}`} />;
  return <Runner tool={tool} />;
}
