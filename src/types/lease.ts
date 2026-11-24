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
  escalation: number;
  escalationDate: string;
  leaseEnd: string;
  noticeDays: number;
  arrears: number;
  arrearsDays: number;
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
