"use client";

import { useEffect, useState } from "react";

import { Button, Card, Notice, SectionHeading } from "../ui";

/**
 * Messages from the contact form.
 *
 * Fetched from the browser rather than rendered on the server, like the claims
 * queue beside it: the inbox changes while the page is open, and a dashboard
 * that needs a reload to show a new message is a dashboard where a message
 * waits a day.
 *
 * `emailed: false` is shown prominently. That row means the message arrived
 * and the notification did not — the one case where looking at this page is
 * the only way anybody finds out, which is exactly when it must be obvious.
 */

type Message = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "new" | "read" | "replied" | "closed";
  emailed: boolean | null;
  email_error: string | null;
  created_at: string;
};

const NEXT_LABEL: Record<Message["status"], { to: Message["status"]; label: string } | null> = {
  new: { to: "read", label: "Marquer comme lu" },
  read: { to: "replied", label: "Marquer comme répondu" },
  replied: { to: "closed", label: "Clore" },
  closed: null,
};

export function AdminInbox() {
  const [messages, setMessages] = useState<Message[] | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  // Fetching and storing are separated on purpose. When this function also
  // called setMessages, the only way to load on mount was to call it from the
  // effect body, which (a) React's own lint rule rejects, because it cannot
  // see that the write happens after an await rather than during the render,
  // and (b) left a real defect behind it: the response could land after the
  // page had been navigated away from, and the write would then be made
  // against an unmounted component. Returning the rows lets each caller decide
  // whether it still wants them.
  const fetchMessages = async (): Promise<Message[]> => {
    try {
      const response = await fetch("/api/admin/contact");
      const payload = (await response.json()) as { messages?: Message[] };
      return payload.messages ?? [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    let alive = true;
    void fetchMessages().then((rows) => {
      if (alive) setMessages(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const change = async (id: string, status: Message["status"]) => {
    setBusy(id);
    try {
      await fetch("/api/admin/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setMessages(await fetchMessages());
    } finally {
      setBusy(null);
    }
  };

  const open = (messages ?? []).filter((row) => row.status === "new" || row.status === "read");
  const failed = (messages ?? []).filter((row) => row.emailed === false);

  return (
    <Card className="p-4 sm:p-5">
      <SectionHeading
        title="Messages reçus"
        description="Ce que les visiteurs écrivent depuis la page Contact. Répondez depuis votre boîte mail : l'e-mail que vous recevez a leur adresse en « répondre à »."
      />

      {messages === undefined ? (
        <p className="mt-3 text-[14px] text-ink-soft">Chargement…</p>
      ) : messages.length === 0 ? (
        <p className="mt-3 text-[14px] text-ink-soft">
          Aucun message. Ils apparaîtront ici dès que quelqu&apos;un écrira depuis la page
          Contact — même si l&apos;envoi de la notification échoue.
        </p>
      ) : (
        <>
          {failed.length > 0 ? (
            <Notice tone="warn" className="mt-3">
              {failed.length} message(s) enregistré(s) mais <strong>non envoyé(s)</strong> par
              e-mail. Ils sont bien là ci-dessous — c&apos;est la notification qui a échoué, pas
              le message.
            </Notice>
          ) : null}

          <p className="mt-3 text-[13px] text-ink-soft">
            {open.length} à traiter sur {messages.length}.
          </p>

          <ul className="mt-3 space-y-3">
            {messages.map((row) => {
              const next = NEXT_LABEL[row.status];
              return (
                <li key={row.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <strong className="text-[15px]">{row.subject}</strong>
                    <span className="text-[13px] text-ink-soft">
                      {row.name} ·{" "}
                      <a href={`mailto:${row.email}`} className="underline">
                        {row.email}
                      </a>
                    </span>
                    <span className="ml-auto text-[12px] uppercase tracking-wide text-ink-soft">
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6">{row.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-ink-soft">
                      {new Date(row.created_at).toLocaleString("fr-FR")}
                    </span>
                    {row.emailed === false ? (
                      <span className="rounded bg-warn-light px-2 py-0.5 text-[12px] text-[#854d0e]">
                        non envoyé{row.email_error ? ` · ${row.email_error}` : ""}
                      </span>
                    ) : null}
                    {next ? (
                      <Button
                        variant="secondary"
                        className="ml-auto"
                        disabled={busy === row.id}
                        onClick={() => change(row.id, next.to)}
                      >
                        {next.label}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
