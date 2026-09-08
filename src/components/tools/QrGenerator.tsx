"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadBlob } from "@/lib/files";
import { canvasToBlob } from "@/lib/tools/canvas";
import type { ToolDefinition } from "@/types/tool";
import { Button, Notice, cx } from "../ui";

type Preset = { id: string; fr: string; en: string; prefix: string; placeholder: string };

const PRESETS: Preset[] = [
  { id: "url", fr: "Lien", en: "Link", prefix: "", placeholder: "https://exemple.cm" },
  {
    id: "whatsapp",
    fr: "WhatsApp",
    en: "WhatsApp",
    prefix: "https://wa.me/",
    placeholder: "237690000000",
  },
  { id: "tel", fr: "Téléphone", en: "Phone", prefix: "tel:", placeholder: "+237690000000" },
  { id: "text", fr: "Texte libre", en: "Free text", prefix: "", placeholder: "" },
];

const SIZES = [256, 512, 1024];

export default function QrGeneratorTool({ tool }: { tool: ToolDefinition }) {
  const { t, locale } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [presetId, setPresetId] = useState("url");
  const [value, setValue] = useState("");
  const [size, setSize] = useState(512);
  const [dark, setDark] = useState("#18181b");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const preset = PRESETS.find((entry) => entry.id === presetId) ?? PRESETS[0];
  const encoded = value.trim() ? `${preset.prefix}${value.trim()}` : "";

  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!encoded) {
        setReady(false);
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      try {
        const QRCode = (await import("qrcode")).default;
        if (cancelled) return;
        await QRCode.toCanvas(canvas, encoded, {
          width: size,
          margin: 2,
          // Medium recovery: readable even when a poster is a little scuffed,
          // without inflating the pattern the way "high" does.
          errorCorrectionLevel: "M",
          color: { dark, light: "#ffffff" },
        });
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setReady(false);
          setError(
            locale === "fr"
              ? "Ce contenu est trop long pour être encodé dans un QR code. Raccourcissez-le."
              : "This content is too long to encode in a QR code. Shorten it.",
          );
        }
      }
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [encoded, size, dark, locale]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const blob = await canvasToBlob(canvas, "image/png");
    downloadBlob(blob, "qr-code.png");
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[14.5px] font-medium text-ink">
          {locale === "fr" ? "Type de contenu" : "Content type"}
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPresetId(entry.id)}
              aria-pressed={presetId === entry.id}
              className={cx(
                "min-h-11 rounded-xl border px-4 text-[14px] font-medium transition-colors",
                presetId === entry.id
                  ? "border-violet-mid bg-violet-light text-violet-deep"
                  : "border-line bg-white text-ink hover:bg-surface-alt",
              )}
            >
              {locale === "fr" ? entry.fr : entry.en}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="qr-value" className="mb-1.5 block text-[14.5px] font-medium text-ink">
          {presetId === "whatsapp"
            ? locale === "fr"
              ? "Numéro au format international, sans + ni espaces"
              : "Number in international format, no + and no spaces"
            : locale === "fr"
              ? "Contenu"
              : "Content"}
        </label>
        <div className="flex items-stretch">
          {preset.prefix ? (
            <span className="flex items-center rounded-l-xl border border-r-0 border-line bg-surface-alt px-3 text-[14px] text-ink-soft">
              {preset.prefix}
            </span>
          ) : null}
          <input
            id="qr-value"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={preset.placeholder}
            inputMode={presetId === "whatsapp" || presetId === "tel" ? "tel" : "text"}
            className={cx(
              "min-h-12 w-full border border-line bg-white px-3 text-[15px] text-ink placeholder:text-ink-soft",
              "focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light",
              preset.prefix ? "rounded-r-xl" : "rounded-xl",
            )}
          />
        </div>
        {presetId === "whatsapp" ? (
          <p className="mt-1.5 text-[12.5px] text-ink-soft">
            {locale === "fr"
              ? "Exemple : 237690000000 pour un numéro camerounais."
              : "Example: 237690000000 for a Cameroonian number."}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[14.5px] font-medium text-ink">
            {locale === "fr" ? "Taille de l'image" : "Image size"}
          </p>
          <div className="flex gap-2">
            {SIZES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSize(option)}
                aria-pressed={size === option}
                className={cx(
                  "min-h-11 flex-1 rounded-xl border text-[14px] font-medium transition-colors",
                  size === option
                    ? "border-violet-mid bg-violet-light text-violet-deep"
                    : "border-line bg-white text-ink hover:bg-surface-alt",
                )}
              >
                {option} px
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="qr-color" className="mb-1.5 block text-[14.5px] font-medium text-ink">
            {locale === "fr" ? "Couleur du code" : "Code colour"}
          </label>
          <input
            id="qr-color"
            type="color"
            value={dark}
            onChange={(event) => setDark(event.target.value)}
            className="h-11 w-20 cursor-pointer rounded-lg border border-line bg-white p-1"
          />
        </div>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="rounded-2xl border border-line bg-surface-alt p-6 text-center">
        <canvas
          ref={canvasRef}
          className={cx(
            "mx-auto h-auto w-full max-w-[260px] rounded-lg bg-white",
            ready ? "" : "opacity-0",
          )}
        />
        {!ready ? (
          <p className="py-16 text-[14px] text-ink-soft">
            {locale === "fr"
              ? "Entrez un lien ou un texte pour voir le QR code."
              : "Enter a link or some text to see the QR code."}
          </p>
        ) : null}
      </div>

      <Button size="lg" className="w-full" disabled={!ready} onClick={download}>
        {t("result.download")} PNG
      </Button>

      <p className="text-center text-[12.5px] text-ink-soft">
        {tool.processingMode === "none"
          ? locale === "fr"
            ? "Le code est généré dans votre navigateur. Rien n'est envoyé ni enregistré."
            : "The code is generated in your browser. Nothing is sent or stored."
          : null}
      </p>
    </div>
  );
}
