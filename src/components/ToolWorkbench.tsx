"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ToolError, toToolError } from "@/lib/errors";
import { track } from "@/lib/analytics";
import { validateFile } from "@/lib/files";
import { batchLimit, TIERS, type TierId } from "@/lib/payments/tiers";
import { useImageObjectUrl } from "@/lib/useObjectUrl";
import type {
  ProgressReport,
  RunContext,
  ToolDefinition,
  ToolResult,
} from "@/types/tool";
import { useUsage } from "@/lib/usage/useUsage";
import { UploadZone } from "./UploadZone";
import { PaywallModal } from "./PaywallModal";
import { SignInRequired } from "./SignInRequired";
import { UsageCounter } from "./UsageCounter";
import { FileList } from "./FileList";
import { ProcessingState } from "./ProcessingState";
import { ResultCard } from "./ResultCard";
import { ToolOptions, defaultsFor, type OptionDescriptor, type OptionValues } from "./ToolOptions";
import { Button, Notice } from "./ui";

type Phase = "idle" | "ready" | "running" | "done" | "error";

export type WorkbenchProps = {
  tool: ToolDefinition;
  options?: OptionDescriptor[];
  run: (ctx: RunContext) => Promise<ToolResult>;
  /** Merge tools want the order to matter and be adjustable. */
  reorderable?: boolean;
  /** Show the result on a checkerboard (transparent PNG output). */
  transparentPreview?: boolean;
  /** Label on the action button, if "Process" is not the right word. */
  actionLabel?: { fr: string; en: string };
  /** Extra UI between the file list and the options (crop surface, previews). */
  children?: (state: {
    files: File[];
    values: OptionValues;
    setValue: (id: string, value: string | number | boolean) => void;
  }) => React.ReactNode;
  /** Called before running; throw a ToolError to block with a clear message. */
  validate?: (files: File[], values: OptionValues) => void;
};

export function ToolWorkbench({
  tool,
  options = [],
  run,
  reorderable = false,
  transparentPreview = false,
  actionLabel,
  children,
  validate,
}: WorkbenchProps) {
  const { t, tx } = useLocale();

  const [files, setFiles] = useState<File[]>([]);
  const [batchBlocked, setBatchBlocked] = useState(false);
  const [values, setValues] = useState<OptionValues>(() => defaultsFor(options));
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<ProgressReport>({ phase: "indeterminate" });
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<ToolError | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const usage = useUsage();
  const tier: TierId = usage.tier;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // A preview of the input, so image results can be shown side by side.
  const originalPreview = useImageObjectUrl(files[0]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      setResult(null);
      const accepted: File[] = [];
      for (const file of incoming) {
        try {
          validateFile(file, tool, tier);
          accepted.push(file);
        } catch (validationError) {
          setError(toToolError(validationError));
          // One bad file should not discard the good ones the user picked.
        }
      }
      if (accepted.length === 0) return;

      const ceiling = batchLimit(tier, tool.multiple);
      setFiles((previous) => {
        const combined = tool.multiple ? [...previous, ...accepted] : accepted.slice(0, 1);
        if (combined.length > ceiling) {
          // The extra files are dropped rather than silently processed: a
          // batch that half-ran is worse than one that did not start, and the
          // user needs to know which files were not included.
          setBatchBlocked(true);
          return combined.slice(0, ceiling);
        }
        return combined;
      });
      setPhase("ready");
    },
    [tool, tier],
  );

  const removeFile = (index: number) => {
    setFiles((previous) => {
      const next = previous.filter((_, i) => i !== index);
      if (next.length === 0) setPhase("idle");
      return next;
    });
    setResult(null);
    setError(null);
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    setFiles((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setValue = (id: string, value: string | number | boolean) => {
    setValues((previous) => ({ ...previous, [id]: value }));
  };

  const reset = () => {
    setFiles([]);
    setBatchBlocked(false);
    setResult(null);
    setError(null);
    setPhase("idle");
    setValues(defaultsFor(options));
  };

  const start = async () => {
    setError(null);
    setResult(null);

    try {
      if (files.length === 0) throw new ToolError("errors.needOneFile");
      validate?.(files, values);
    } catch (validationError) {
      setError(toToolError(validationError));
      setPhase("error");
      return;
    }

    // Ask the server for permission before any work starts. The answer comes
    // from the session cookie and the database, never from this page — there
    // is no "isPro" flag here for anyone to edit in dev tools.
    const permission = await usage.claim(tool.id);
    if (permission.signInRequired) {
      // The session ran out after the page opened. The server has refused;
      // say why and offer the way back, rather than a paywall that would
      // suggest the problem is money.
      setSessionExpired(true);
      setPhase("ready");
      return;
    }
    if (!permission.allowed) {
      setPaywallOpen(true);
      setPhase("ready");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ phase: "indeterminate" });
    setPhase("running");

    // Fire-and-forget, and contentless: a tool id and a verdict, never a
    // filename and never anything from the file itself.
    const startedAt = Date.now();
    track(tool.id, "start");

    try {
      const output = await run({
        files,
        options: values,
        report: setProgress,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult(output);
      setPhase("done");
      track(tool.id, "success", { durationMs: Date.now() - startedAt });
    } catch (runError) {
      if (controller.signal.aborted) {
        setPhase("ready");
        return;
      }
      const failure = toToolError(runError);
      setError(failure);
      setPhase("error");
      // The error KEY — one of our own translation keys, such as
      // "errors.badPdf" — not the message, which could contain anything a
      // library chose to put in it.
      track(tool.id, "error", {
        durationMs: Date.now() - startedAt,
        errorKey: failure.key.replace(/[^a-z0-9_.-]/gi, ""),
      });
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("ready");
  };

  const action = actionLabel
    ? tx(actionLabel)
    : t(files.length > 1 ? "common.processMulti" : "common.process");
  const optionsToShow = useMemo(() => options, [options]);

  const paywall = (
    <PaywallModal
      open={paywallOpen}
      onClose={() => setPaywallOpen(false)}
      prices={usage.prices ?? undefined}
    />
  );

  if (sessionExpired) {
    return <SignInRequired path={`/tool/${tool.id}`} expired />;
  }

  if (phase === "running") {
    return (
      <>
        <ProcessingState progress={progress} onCancel={cancel} />
        {paywall}
      </>
    );
  }

  if (phase === "done" && result) {
    return (
      <>
        <ResultCard
          result={result}
          onReset={reset}
          originalPreview={originalPreview}
          transparentPreview={transparentPreview}
          tier={tier}
        />
        <div className="mt-4">
          <UsageCounter remaining={usage.remaining} isPro={usage.isPro} />
        </div>
        {paywall}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {files.length === 0 ? (
        <UploadZone tool={tool} onFiles={addFiles} />
      ) : (
        <>
          <FileList
            files={files}
            onRemove={removeFile}
            onMove={reorderable ? moveFile : undefined}
            reorderable={reorderable}
          />
          {tool.multiple ? <UploadZone tool={tool} onFiles={addFiles} compact /> : null}
        </>
      )}

      {batchBlocked ? (
        <p
          className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
          data-testid="batch-limit"
          role="status"
        >
          {t(tier === "free" ? "batch.limitFree" : "batch.limitPro", {
            max: batchLimit(tier, tool.multiple),
            pro: TIERS.pro.batchFiles,
          })}
        </p>
      ) : null}

      {error ? (
        <Notice tone="danger" data-testid="error">
          <p className="font-semibold">{t("errors.title")}</p>
          <p className="mt-0.5">{t(error.key, error.vars)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {files.length > 0 ? (
              <Button variant="secondary" onClick={start}>
                {t("errors.retry")}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={reset}>
              {t("errors.chooseAnother")}
            </Button>
          </div>
        </Notice>
      ) : null}

      {files.length > 0 ? (
        <>
          {children?.({ files, values, setValue })}

          <ToolOptions descriptors={optionsToShow} values={values} onChange={setValue} />

          <Button size="lg" className="w-full" data-testid="run" onClick={start}>
            {action}
          </Button>

          <UsageCounter remaining={usage.remaining} isPro={usage.isPro} />
        </>
      ) : null}

      {paywall}
    </div>
  );
}
