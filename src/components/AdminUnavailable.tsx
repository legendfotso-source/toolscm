import type { ReactNode } from "react";

/**
 * What /admin shows when it cannot read the database.
 *
 * Not a 404 and not an error page. The person looking at this is the owner —
 * the only person who can fix what is wrong — and the thing he needs is the
 * provider's own error message and the next step, on screen, rather than in a
 * function log he would have to know to look for.
 *
 * The page before this one answered a database fault with the same 404 a
 * stranger gets. That is the failure mode this component exists to end.
 */
export function AdminUnavailable({ health }: { health: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        La page est accessible, mais le serveur n&apos;arrive pas à lire la base de données,
        donc les chiffres et la liste des comptes ne peuvent pas s&apos;afficher. Le détail
        est ci-dessous.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Tant que cette lecture échoue, le site tourne sans limites d&apos;usage et aucun
        compte ne reçoit son abonnement : ce n&apos;est pas une page cassée, c&apos;est la
        panne elle-même.
      </p>
      <div className="mt-6">
        {health}
      </div>
    </main>
  );
}
