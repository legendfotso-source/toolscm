import type { Metadata } from "next";
import { PaymentReturn } from "@/components/PaymentReturn";

export const metadata: Metadata = {
  title: "Paiement — Tools.cm",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: {
  // Next 16: search params are async.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const provider = one(params.provider);
  const reference = one(params.reference);

  return (
    <PaymentReturn
      provider={
        provider === "stripe" || provider === "notchpay" || provider === "campay"
          ? provider
          : null
      }
      reference={reference ?? null}
    />
  );
}
