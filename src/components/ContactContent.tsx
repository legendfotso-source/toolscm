"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button, Notice, SectionHeading } from "./ui";

/**
 * No server, so no fake "message sent" confirmation.
 *
 * The form composes a real mail in the visitor's own mail app, which genuinely
 * reaches us and leaves them with a copy in their sent folder. The address is
 * also shown in full, for anyone whose device has no mail client configured.
 */
export function ContactContent() {
  const { t, locale } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const canSend = message.trim().length > 0;

  const openMailClient = () => {
    const subject =
      locale === "fr" ? "Message depuis Tools.cm" : "Message from Tools.cm";
    const body = [
      message.trim(),
      "",
      "—",
      name.trim() ? `${locale === "fr" ? "Nom" : "Name"}: ${name.trim()}` : "",
      email.trim() ? `Email: ${email.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const labelClass = "mb-1.5 block text-[14.5px] font-medium text-ink";
  const fieldClass =
    "w-full rounded-xl border border-line bg-white px-3 py-3 text-[15px] text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light";

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <Breadcrumbs items={[{ label: t("contact.title") }]} />

        <SectionHeading title={t("contact.title")} description={t("contact.subtitle")} />

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            openMailClient();
          }}
        >
          <div>
            <label htmlFor="contact-name" className={labelClass}>
              {t("contact.name")}
            </label>
            <input
              id="contact-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="contact-email" className={labelClass}>
              {t("contact.email")}
            </label>
            <input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="contact-message" className={labelClass}>
              {t("contact.message")}
            </label>
            <textarea
              id="contact-message"
              rows={6}
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={fieldClass}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={!canSend}>
            {locale === "fr" ? "Ouvrir mon application mail" : "Open my mail app"}
          </Button>
        </form>

        <Notice tone="info" className="mt-5">
          {locale === "fr" ? (
            <>
              Ce formulaire prépare simplement un message dans votre application mail : aucune
              donnée n&apos;est envoyée à un serveur depuis cette page. Vous pouvez aussi écrire
              directement à{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </>
          ) : (
            <>
              This form simply prepares a message in your mail app: no data is sent to a server
              from this page. You can also write directly to{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </>
          )}
        </Notice>
      </div>
    </div>
  );
}
