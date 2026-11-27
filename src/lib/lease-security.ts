import {
  isLeaseDate,
  type DepositInterestRule,
  type SecurityType,
} from "@/types/lease";

export const securityTypes = {
  cash_deposit: "Cash deposit",
  bank_guarantee: "Bank guarantee",
  none: "No security",
} satisfies Record<SecurityType, string>;

export const depositInterestRules = {
  landlord_account: "Landlord account",
  interest_bearing_tenant: "Interest-bearing for tenant",
  non_interest_bearing: "Non-interest-bearing",
  n_a: "Not applicable",
} satisfies Record<DepositInterestRule, string>;

type SecurityInput = Partial<
  Record<
    | "securityType"
    | "securityAmount"
    | "guaranteeExpiry"
    | "depositInterestRule"
    | "securityNotes",
    unknown
  >
>;

export function leaseSecurity(input: SecurityInput) {
  const securityType: SecurityType =
    input.securityType === "bank_guarantee" || input.securityType === "none"
      ? input.securityType
      : "cash_deposit";
  const validRule = Object.keys(depositInterestRules).find(
    (key) => key === input.depositInterestRule,
  ) as DepositInterestRule | undefined;
  return {
    securityType,
    securityAmount:
      securityType !== "none" &&
      typeof input.securityAmount === "number" &&
      Number.isFinite(input.securityAmount) &&
      input.securityAmount >= 0
        ? input.securityAmount
        : 0,
    guaranteeExpiry:
      securityType === "bank_guarantee" && isLeaseDate(input.guaranteeExpiry)
        ? input.guaranteeExpiry
        : "",
    depositInterestRule:
      securityType === "cash_deposit"
        ? (validRule ?? "interest_bearing_tenant")
        : "n_a",
    securityNotes:
      typeof input.securityNotes === "string"
        ? input.securityNotes.trim().slice(0, 1000)
        : "",
  };
}

export function guaranteeAlert(expiry: string, today: string) {
  if (!expiry || !today) return null;
  const days = (Date.parse(expiry) - Date.parse(today)) / 86_400_000;
  if (days < 0) return { expired: true, text: "Guarantee expired" };
  if (days === 0) return { expired: false, text: "Guarantee expires today" };
  if (days <= 60)
    return {
      expired: false,
      text: `Guarantee expires in ${days} ${days === 1 ? "day" : "days"}`,
    };
  return null;
}

export function securitySummary(
  security: ReturnType<typeof leaseSecurity>,
  formatMoney: (amount: number) => string,
) {
  const label = securityTypes[security.securityType];
  if (security.securityType === "none") return label;
  const coverage = `${label}: ${formatMoney(security.securityAmount)}`;
  return security.securityType === "bank_guarantee"
    ? `${coverage} · ${security.guaranteeExpiry ? "Exp " + security.guaranteeExpiry : "Expiry not recorded"}`
    : coverage;
}
