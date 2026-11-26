import type { Lease } from "@/types/lease";

export const leaseVatRate = 15;

export function monthlyLeaseCharges(
  lease: Pick<
    Lease,
    "rent" | "operatingCosts" | "municipalCharges" | "vatApplicable"
  >,
  baseRent = lease.rent,
) {
  const cents = (amount: number) =>
    Math.round((amount + Number.EPSILON * Math.abs(amount)) * 100);
  const base = cents(baseRent);
  const operating = cents(lease.operatingCosts ?? 0);
  const municipal = cents(lease.municipalCharges ?? 0);
  const subtotal = base + operating + municipal;
  const vatApplicable = lease.vatApplicable ?? true;
  const vat = vatApplicable ? Math.round((subtotal * leaseVatRate) / 100) : 0;
  return {
    baseRent: base / 100,
    operatingCosts: operating / 100,
    municipalCharges: municipal / 100,
    subtotal: subtotal / 100,
    vatApplicable,
    vat: vat / 100,
    total: (subtotal + vat) / 100,
  };
}
