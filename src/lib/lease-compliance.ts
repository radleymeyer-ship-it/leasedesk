import {
  isLeaseDate,
  type EntityType,
  type FicaChecklist,
  type Lease,
} from "@/types/lease";

export const entityTypes = {
  company: "Company (Pty) Ltd",
  close_corporation: "Close Corporation (CC)",
  trust: "Trust",
  individual: "Individual",
} satisfies Record<EntityType, string>;

const registrationDocs = {
  company: "CIPC CoR 14.3 & Director Register",
  close_corporation: "CK1 / CK2 Founding Statement",
  trust: "Trust Deed & Letters of Authority",
  individual: "Individual Identification Documents",
} satisfies Record<EntityType, string>;

const checks = {
  cipcOrTrustDocs: "Registration / Founding Docs",
  beneficialOwnership: "Beneficial Ownership Filing",
  directorMemberIds: "Director / Member / Trustee IDs",
  proofOfAddress: "Proof of Address (< 3 months)",
  resolutionAuthorisingSignatory: "Authorising Resolution",
  signedLeaseAndAddenda: "Signed Lease & Addenda",
} satisfies Record<
  Exclude<keyof FicaChecklist, "proofOfAddressDate" | "complianceNotes">,
  string
>;

const keys = Object.keys(checks) as (keyof typeof checks)[];
export const ficaTotal = keys.length;

export function ficaItems(entityType: EntityType) {
  return keys.map((key) => ({
    key,
    label: key === "cipcOrTrustDocs" ? registrationDocs[entityType] : checks[key],
  }));
}

export function ficaFlags(verified: boolean) {
  return Object.fromEntries(keys.map((key) => [key, verified])) as Record<
    keyof typeof checks,
    boolean
  >;
}

export function leaseCompliance(
  input: Pick<Lease, "entityType" | "ficaChecklist">,
) {
  const entityType =
    input.entityType && Object.hasOwn(entityTypes, input.entityType)
      ? input.entityType
      : "company";
  const checklist = input.ficaChecklist;
  const ficaChecklist: FicaChecklist = {
    ...ficaFlags(false),
    proofOfAddressDate: isLeaseDate(checklist?.proofOfAddressDate)
      ? checklist.proofOfAddressDate
      : "",
    complianceNotes:
      typeof checklist?.complianceNotes === "string"
        ? checklist.complianceNotes
        : "",
  };
  for (const key of keys) ficaChecklist[key] = checklist?.[key] === true;
  return { entityType, ficaChecklist };
}

export function ficaStatus(lease: Lease) {
  const { entityType, ficaChecklist } = leaseCompliance(lease);
  const missing = ficaItems(entityType)
    .filter(({ key }) => !ficaChecklist[key])
    .map(({ label }) => label);
  return {
    missing,
    count: ficaTotal - missing.length,
    complete: missing.length === 0,
  };
}
