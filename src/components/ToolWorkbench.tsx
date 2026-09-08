"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ToolError, toToolError } from "@/lib/errors";
import { validateFile } from "@/lib/files";
import { useImageObjectUrl } from "@/lib/useObjectUrl";
import type {
  ProgressReport,
  RunContext,
  ToolDefinition,
  ToolResult,
} from "@/types/tool";
import { UploadZone } from "./UploadZone";
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
  const [values, setValues] = useState<OptionValues>(() => defaultsFor(options));
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<ProgressReport>({ phase: "indeterminate" });
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<ToolError | null>(null);

  const abortRef = useRef<AbortController | null>(null);

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
          validateFile(file, tool);
          accepted.push(file);
        } catch (validationError) {
          setError(toToolError(validationError));
          // One bad file should not discard the good ones the user picked.
        }
      }
      if (accepted.length === 0) return;
      setFiles((previous) =>
        tool.multiple ? [...previous, ...accepted] : accepted.slice(0, 1),
      );
      setPhase("ready");
    },
    [tool],
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

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ phase: "indeterminate" });
    setPhase("running");

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
    } catch (runError) {
      if (controller.signal.aborted) {
        setPhase("ready");
        return;
      }
      setError(toToolError(runError));
      setPhase("error");
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

  if (phase === "running") {
    return <ProcessingState progress={progress} onCancel={cancel} />;
  }

  if (phase === "done" && result) {
    return (
      <ResultCard
        result={result}
        onReset={reset}
        originalPreview={originalPreview}
        transparentPreview={transparentPreview}
      />
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
        </>
      ) : null}
    </div>
  );
}
