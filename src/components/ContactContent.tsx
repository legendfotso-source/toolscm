"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button, Notice, SectionHeading } from "./ui";

/**
 * The contact form, which now actually sends.
 *
 * Until today this composed a `mailto:` and sent nothing: the message only
 * existed if the visitor's device had a mail client configured, and on a phone
 * without one the form simply did nothing at all. It now posts to
 * /api/contact, which stores the message and emails it.
 *
 * The mail-client route is kept as a second button rather than removed. Some
 * people prefer a copy in their own sent folder, and it is the way through if
 * the send ever fails — a form with one path and no fallback is a form that
 * loses the message when that path breaks.
 *
 * The confirmation says exactly what happened, never more. If the message was
 * saved but the notification did not go out, it says we have it — not "it has
 * been emailed". A contact form that claims more than happened is the one
 * thing worse than a contact form that does nothing.
 */
export function ContactContent() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  /** The honeypot: hidden from people, filled in by bots. */
  const [website, setWebsite] = useState("");

  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const trimmedMessage = message.trim();
  const emailLooksRight = /^[^@\s]+@[^@.\s]+(\.[^@.\s]+)+$/.test(email.trim());
  const canSend =
    name.trim().length > 0 &&
    emailLooksRight &&
    subject.trim().length > 0 &&
    trimmedMessage.length >= 10 &&
    state !== "sending";

  const submit = async () => {
    setState("sending");
    setProblem(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: trimmedMessage,
          website,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (response.ok && payload.ok) {
        setState("sent");
        setMessage("");
        setSubject("");
        return;
      }

      setState("error");
      setProblem(
        response.status === 429
          ? fr
            ? "Vous avez déjà envoyé plusieurs messages récemment. Réessayez dans un moment, ou écrivez-nous directement."
            : "You have sent several messages recently. Try again shortly, or write to us directly."
          : payload.error === "invalid_email"
            ? fr
              ? "Cette adresse e-mail ne semble pas valide — sans elle nous ne pourrons pas vous répondre."
              : "That email address does not look valid — without it we cannot reply."
            : fr
              ? "L'envoi n'a pas abouti. Réessayez, ou écrivez-nous directement par e-mail."
              : "The message could not be sent. Try again, or write to us by email.",
      );
    } catch {
      setState("error");
      setProblem(
        fr
          ? "Pas de connexion. Vérifiez votre réseau, ou écrivez-nous directement par e-mail."
          : "No connection. Check your network, or write to us by email.",
      );
    }
  };

  const openMailClient = () => {
    const mailSubject = subject.trim() || (fr ? "Message depuis Tools.cm" : "Message from Tools.cm");
    const body = [
      trimmedMessage,
      "",
      "—",
      name.trim() ? `${fr ? "Nom" : "Name"}: ${name.trim()}` : "",
      email.trim() ? `Email: ${email.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      mailSubject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const labelClass = "mb-1.5 block text-[14.5px] font-medium text-ink";
  const fieldClass =
    "w-full rounded-xl border border-line bg-white px-3 py-3 text-[15px] text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light";

  if (state === "sent") {
    return (
      <div className="container-page py-6 sm:py-8">
        <div className="mx-auto max-w-xl">
          <Breadcrumbs items={[{ label: t("contact.title") }]} />
          <SectionHeading title={t("contact.title")} description={t("contact.subtitle")} />
          <Notice tone="success" className="mt-2">
            {fr
              ? "Message reçu. Nous vous répondrons à l'adresse que vous avez indiquée."
              : "Message received. We will reply to the address you gave."}
          </Notice>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => setState("idle")}
          >
            {fr ? "Écrire un autre message" : "Write another message"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <Breadcrumbs items={[{ label: t("contact.title") }]} />

        <SectionHeading title={t("contact.title")} description={t("contact.subtitle")} />

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) void submit();
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
              required
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
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-[13px] text-ink-soft">
              {fr
                ? "C'est à cette adresse que nous répondrons."
                : "This is where we will reply."}
            </p>
          </div>

          <div>
            <label htmlFor="contact-subject" className={labelClass}>
              {fr ? "Sujet" : "Subject"}
            </label>
            <input
              id="contact-subject"
              type="text"
              required
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
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
            <p className="mt-1 text-[13px] text-ink-soft">
              {trimmedMessage.length > 0 && trimmedMessage.length < 10
                ? fr
                  ? "Encore quelques mots, pour qu'on puisse vous aider."
                  : "A few more words, so we can help."
                : `${trimmedMessage.length} / 5000`}
            </p>
          </div>

          {/* The honeypot. Hidden from people and from screen readers, left in
              the tab order's way for nobody: a bot that fills every input it
              finds fills this one, and the submission is then discarded with
              the same success message a person would see. */}
          <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          {state === "error" && problem ? (
            <Notice tone="danger">{problem}</Notice>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={!canSend}>
            {state === "sending"
              ? fr
                ? "Envoi…"
                : "Sending…"
              : fr
                ? "Envoyer le message"
                : "Send message"}
          </Button>

          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="w-full"
            onClick={openMailClient}
            disabled={trimmedMessage.length === 0}
          >
            {fr ? "Ou ouvrir mon application mail" : "Or open my mail app"}
          </Button>
        </form>

        <Notice tone="info" className="mt-5">
          {fr ? (
            <>
              Nous ne gardons que ce que vous écrivez ici : votre nom, votre adresse et votre
              message, pour pouvoir vous répondre. Vous pouvez aussi écrire directement à{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </>
          ) : (
            <>
              We keep only what you write here — your name, your address and your message, so we
              can reply. You can also write directly to{" "}
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
