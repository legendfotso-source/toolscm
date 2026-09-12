"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Button, Card, Notice } from "./ui";

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "granted"; proUntil: string | null; duplicate: boolean }
  | { kind: "revoked" }
  | { kind: "error"; message: string };

/**
 * Activate Pro for someone who paid by Mobile Money.
 *
 * The honest first version of taking money here: the customer sends 2,000 FCFA
 * to your MTN or Orange number, you read the transaction id off the
 * confirmation SMS, and you type it in. No payment API, no webhook, nothing
 * pretending to be automatic — and the money is genuinely in your account
 * before anyone gets anything.
 */
export function AdminProAccess({ priceXaf }: { priceXaf: number }) {
  const { locale } = useLocale();
  const fr = locale === "fr";

  const [email, setEmail] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState(String(priceXaf));
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  const post = async (body: Record<string, unknown>) => {
    setOutcome({ kind: "busy" });
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        error?: string;
        proUntil?: string | null;
        duplicate?: boolean;
        action?: string;
      };

      if (!response.ok) {
        const messages: Record<string, string> = {
          no_such_account: fr
            ? "Aucun compte avec cette adresse. La personne doit d'abord créer un compte sur le site."
            : "No account with that address. They need to sign up on the site first.",
          invalid_body: fr ? "Vérifiez les champs saisis." : "Check the fields.",
          not_found: fr ? "Action non autorisée." : "Not allowed.",
        };
        setOutcome({
          kind: "error",
          message:
            messages[data.error ?? ""] ??
            (fr ? "L'opération a échoué." : "The operation failed."),
        });
        return;
      }

      if (data.action === "revoke") {
        setOutcome({ kind: "revoked" });
        return;
      }

      setOutcome({
        kind: "granted",
        proUntil: data.proUntil ?? null,
        duplicate: Boolean(data.duplicate),
      });
      setTransactionId("");
      setNote("");
    } catch {
      setOutcome({
        kind: "error",
        message: fr ? "Le serveur est injoignable." : "The server could not be reached.",
      });
    }
  };

  const grant = () =>
    post({
      action: "grant",
      email: email.trim(),
      transactionId: transactionId.trim(),
      amount: Number(amount),
      currency: "XAF",
      days: Number(days),
      note: note.trim() || undefined,
    });

  const revoke = () => post({ action: "revoke", email: email.trim() });

  const ready = email.trim().length > 3 && transactionId.trim().length > 2;
  const busy = outcome.kind === "busy";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-ink">
        {fr ? "Activer Pro après un paiement Mobile Money" : "Activate Pro after a Mobile Money payment"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Saisissez l'identifiant de transaction figurant sur le SMS de confirmation. Le même identifiant saisi deux fois n'ajoute pas un second mois."
          : "Enter the transaction id from the confirmation SMS. The same id entered twice does not add a second month."}
      </p>

      <div className="mt-4 space-y-3">
        <Field
          label={fr ? "Adresse e-mail du compte" : "Account email address"}
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="client@example.com"
        />
        <Field
          label={fr ? "Identifiant de transaction" : "Transaction id"}
          value={transactionId}
          onChange={setTransactionId}
          placeholder={fr ? "ex. MP240912.1423.A12345" : "e.g. MP240912.1423.A12345"}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={fr ? "Montant (FCFA)" : "Amount (FCFA)"}
            value={amount}
            onChange={setAmount}
            type="number"
          />
          <Field
            label={fr ? "Durée (jours)" : "Length (days)"}
            value={days}
            onChange={setDays}
            type="number"
          />
        </div>
        <Field
          label={fr ? "Note (facultatif)" : "Note (optional)"}
          value={note}
          onChange={setNote}
          placeholder={fr ? "MTN MoMo, 0h37" : "MTN MoMo, 00:37"}
        />
      </div>

      {outcome.kind === "error" ? (
        <Notice tone="danger" className="mt-4">
          {outcome.message}
        </Notice>
      ) : null}

      {outcome.kind === "granted" ? (
        <Notice tone={outcome.duplicate ? "warn" : "success"} className="mt-4">
          {outcome.duplicate
            ? fr
              ? "Cette transaction avait déjà été enregistrée — rien n'a été ajouté."
              : "That transaction was already recorded — nothing was added."
            : fr
              ? `Pro actif jusqu'au ${outcome.proUntil ? formatDate(outcome.proUntil) : "—"}.`
              : `Pro is active until ${outcome.proUntil ? formatDate(outcome.proUntil) : "—"}.`}
        </Notice>
      ) : null}

      {outcome.kind === "revoked" ? (
        <Notice tone="success" className="mt-4">
          {fr ? "L'accès Pro a été retiré." : "Pro access has been removed."}
        </Notice>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={grant} disabled={!ready || busy}>
          {busy ? (fr ? "..." : "...") : fr ? "Activer Pro" : "Activate Pro"}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          onClick={revoke}
          disabled={email.trim().length < 4 || busy}
        >
          {fr ? "Retirer Pro" : "Remove Pro"}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[14px] font-medium text-ink">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
      />
    </div>
  );
}
