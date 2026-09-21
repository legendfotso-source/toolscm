"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { type Receipt, receiptMessage, whatsappNumber } from "@/lib/payments/receipt";
import { tierName, tierPriceXaf } from "@/lib/payments/tiers";
import type { PaidTier } from "@/lib/payments/plans";
import { formatXaf } from "@/lib/payments/format";
import { Button, Card, Notice, cx } from "./ui";

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "granted"; receipt: Receipt | null; duplicate: boolean; phone: string }
  | { kind: "revoked" }
  | { kind: "error"; message: string };

/**
 * Activate Pro or Max for someone who paid by Mobile Money, then thank them.
 *
 * The honest first version of taking money here: the customer sends the price
 * of the plan they chose to the MTN or Orange number, you read the transaction id off the
 * confirmation SMS, and you type it in. No payment API, no webhook, nothing
 * pretending to be automatic — and the money is genuinely in the account
 * before anyone gets anything.
 *
 * The receipt is not decoration. Someone who has just sent money to a personal
 * phone number has no proof of anything until you give them some, and one
 * WhatsApp message with a reference and an end date is the difference between
 * a customer who renews and one who quietly decides it felt dodgy.
 */
export function AdminProAccess({ priceXaf }: { priceXaf: number }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [tier, setTier] = useState<PaidTier>("pro");

  const [email, setEmail] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(String(priceXaf));
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    setOutcome({ kind: "busy" });
    setCopied(false);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        error?: string;
        duplicate?: boolean;
        action?: string;
        receipt?: Receipt | null;
      };

      if (!response.ok) {
        const messages: Record<string, string> = {
          no_such_account: fr
            ? "Aucun compte avec cette adresse. La personne doit d'abord créer un compte sur le site — demandez-lui de s'inscrire, puis réessayez."
            : "No account with that address. They need to sign up on the site first — ask them to, then try again.",
          invalid_body: fr ? "Vérifiez les champs saisis." : "Check the fields.",
          not_found: fr ? "Action non autorisée." : "Not allowed.",
        };
        setOutcome({
          kind: "error",
          message:
            messages[data.error ?? ""] ?? (fr ? "L'opération a échoué." : "The operation failed."),
        });
        return;
      }

      if (data.action === "revoke") {
        setOutcome({ kind: "revoked" });
        return;
      }

      setOutcome({
        kind: "granted",
        receipt: data.receipt ?? null,
        duplicate: Boolean(data.duplicate),
        phone: phone.trim(),
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

  // Choosing a plan resets the amount to that plan's monthly price, computed
  // by the same rule the site shows customers. It stays editable: someone
  // who paid for three months sent a different amount.
  const chooseTier = (next: PaidTier) => {
    setTier(next);
    setAmount(String(tierPriceXaf(priceXaf, next)));
  };

  const grant = () =>
    post({
      action: "grant",
      tier,
      email: email.trim(),
      transactionId: transactionId.trim(),
      amount: Number(amount),
      currency: "XAF",
      days: Number(days),
      note: note.trim() || undefined,
      phone: phone.trim() || undefined,
    });

  const revoke = () => post({ action: "revoke", email: email.trim() });

  const ready = email.trim().length > 3 && transactionId.trim().length > 2;
  const busy = outcome.kind === "busy";

  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-ink">
        {fr
          ? "Activer un abonnement après un paiement Mobile Money"
          : "Activate a plan after a Mobile Money payment"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {fr
          ? "Saisissez l'identifiant de transaction figurant sur le SMS de confirmation. Le même identifiant saisi deux fois n'ajoute pas un second mois."
          : "Enter the transaction id from the confirmation SMS. The same id entered twice does not add a second month."}
      </p>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={fr ? "Formule" : "Plan"}>
          {(["pro", "max"] as PaidTier[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseTier(id)}
              aria-pressed={id === tier}
              className={cx(
                "min-h-11 rounded-xl border px-3 py-2 text-left",
                id === tier ? "border-violet-deep bg-violet-light ring-1 ring-violet-deep" : "border-line bg-white",
              )}
            >
              <span className="block text-[14px] font-bold text-ink">{tierName(id, fr)}</span>
              <span className="block text-[12.5px] tabular-nums text-ink-soft">
                {formatXaf(tierPriceXaf(priceXaf, id), fr)} {fr ? "/ mois" : "/ month"}
              </span>
            </button>
          ))}
        </div>
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
        <Field
          label={fr ? "Numéro WhatsApp du client" : "Customer's WhatsApp number"}
          hint={
            fr
              ? "Pour lui envoyer le reçu. 699 74 49 70 ou +237699744970 — les deux marchent."
              : "So the receipt can be sent. 699 74 49 70 or +237699744970 both work."
          }
          value={phone}
          onChange={setPhone}
          type="tel"
          placeholder="+237 6.. .. .. .."
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

      {outcome.kind === "revoked" ? (
        <Notice tone="success" className="mt-4">
          {fr ? "L'abonnement a été retiré." : "The plan has been removed."}
        </Notice>
      ) : null}

      {outcome.kind === "granted" && outcome.receipt ? (
        <ReceiptPanel
          receipt={outcome.receipt}
          duplicate={outcome.duplicate}
          phone={outcome.phone}
          fr={fr}
          copied={copied}
          onCopied={setCopied}
        />
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={grant} disabled={!ready || busy}>
          {busy ? "..." : fr ? `Activer ${tierName(tier, fr)}` : `Activate ${tierName(tier, fr)}`}
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

function ReceiptPanel({
  receipt,
  duplicate,
  phone,
  fr,
  copied,
  onCopied,
}: {
  receipt: Receipt;
  duplicate: boolean;
  phone: string;
  fr: boolean;
  copied: boolean;
  onCopied: (value: boolean) => void;
}) {
  const message = receiptMessage(receipt, fr ? "fr" : "en");
  const wa = phone ? whatsappNumber(phone) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      onCopied(true);
    } catch {
      onCopied(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-violet-border bg-violet-light p-4">
      {duplicate ? (
        <Notice tone="warn" className="mb-3">
          {fr
            ? "Cette transaction avait déjà été enregistrée — rien n'a été ajouté. Voici le reçu d'origine."
            : "That transaction was already recorded — nothing was added. Here is the original receipt."}
        </Notice>
      ) : null}

      <p className="text-[13px] font-bold uppercase tracking-wide text-violet-deep">
        {fr ? "Reçu" : "Receipt"}
      </p>

      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-white p-3 text-[13px] leading-5 text-ink">
        {message}
      </pre>

      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        {wa ? (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-violet-deep px-4 text-[15px] font-semibold text-white transition-colors hover:bg-violet-mid"
          >
            {fr ? "Envoyer sur WhatsApp" : "Send on WhatsApp"}
          </a>
        ) : (
          <p className="flex-1 self-center text-[12.5px] leading-5 text-ink-soft">
            {phone
              ? fr
                ? "Ce numéro n'est pas exploitable — vérifiez-le pour envoyer le reçu."
                : "That number is not usable — check it to send the receipt."
              : fr
                ? "Ajoutez un numéro WhatsApp pour envoyer le reçu en un geste."
                : "Add a WhatsApp number to send the receipt in one tap."}
          </p>
        )}

        <Button variant="secondary" size="lg" onClick={copy}>
          {copied ? (fr ? "Copié" : "Copied") : fr ? "Copier le texte" : "Copy the text"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  hint?: string;
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
      {hint ? <p className="mt-1 text-[12px] leading-4 text-ink-soft">{hint}</p> : null}
    </div>
  );
}
