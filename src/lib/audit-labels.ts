/**
 * What an administrative action is called, and what it is called in French.
 *
 * Its own module with no imports, because the admin screens are client
 * components and `audit.ts` is server-only: a client importing a VALUE from a
 * server-only module fails the build, and the fix is not to weaken the guard
 * on audit.ts — that guard is what stops the service-role client reaching a
 * browser bundle. Names and labels are not server knowledge, so they live
 * here and both sides import them.
 */
/**
 * The actions worth a line. A closed list rather than free text, because a
 * log you cannot filter is a log you scroll past — and because a typo in an
 * action name silently creates a second category that no query finds.
 */
export type AuditAction =
  | "grant.create"
  | "grant.revoke"
  | "subscription.grant"
  | "subscription.revoke"
  | "unlimited.enable"
  | "unlimited.disable"
  | "claim.approve"
  | "claim.reject"
  | "account.suspend"
  | "account.block"
  | "account.unblock"
  | "account.deactivate"
  | "account.restore"
  | "admin.appoint"
  | "admin.dismiss"
  | "note.add"
  | "settings.update"
  | "contact.status";

/** One line of French for each action, for the admin screens. */
export const ACTION_LABEL: Record<AuditAction, string> = {
  "grant.create": "Accès accordé",
  "grant.revoke": "Accès retiré",
  "subscription.grant": "Abonnement activé à la main",
  "subscription.revoke": "Abonnement annulé",
  "unlimited.enable": "Illimité activé",
  "unlimited.disable": "Illimité retiré",
  "claim.approve": "Paiement déclaré approuvé",
  "claim.reject": "Paiement déclaré refusé",
  "account.suspend": "Compte suspendu",
  "account.block": "Compte bloqué",
  "account.unblock": "Compte débloqué",
  "account.deactivate": "Compte désactivé",
  "account.restore": "Compte rétabli",
  "admin.appoint": "Administrateur nommé",
  "admin.dismiss": "Administrateur retiré",
  "note.add": "Note interne ajoutée",
  "settings.update": "Réglages modifiés",
  "contact.status": "Message de contact traité",
};
