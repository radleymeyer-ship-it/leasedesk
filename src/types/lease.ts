export type SecurityType = "cash_deposit" | "bank_guarantee" | "none";
export type DepositInterestRule =
  | "landlord_account"
  | "interest_bearing_tenant"
  | "non_interest_bearing"
  | "n_a";

export type EntityType = "company" | "close_corporation" | "trust" | "individual";

export type FicaChecklist = {
  cipcOrTrustDocs: boolean;
  beneficialOwnership: boolean;
  directorMemberIds: boolean;
  proofOfAddress: boolean;
  resolutionAuthorisingSignatory: boolean;
  signedLeaseAndAddenda: boolean;
  proofOfAddressDate: string;
  complianceNotes: string;
};

export type Lease = {
  id: string;
  property: string;
  unit: string;
  tenant: string;
  tenantEmail: string;
  tenantPhone: string;
  landlord: string;
  landlordContact: string;
  rent: number;
  operatingCosts?: number;
  municipalCharges?: number;
  vatApplicable?: boolean;
  escalation: number;
  escalationDate: string;
  leaseEnd: string;
  noticeDays: number;
  arrears: number;
  arrearsDays: number;
  securityType?: SecurityType;
  securityAmount?: number;
  guaranteeExpiry?: string;
  depositInterestRule?: DepositInterestRule;
  securityNotes?: string;
  entityType?: EntityType;
  ficaChecklist?: FicaChecklist;
};

export type LeaseDraft = Omit<Lease, "id" | "rent" | "escalation"> & {
  rent: number | null;
  escalation: number | null;
};

export function isLeaseDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
