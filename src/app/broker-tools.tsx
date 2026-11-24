"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lease } from "@/types/lease";

type ReportLease = {
  l: Lease & { followUp?: { stage: string } };
  daysLeft: number;
  escIn: number;
  noticeBy: number;
  newRent: number;
};

const money = (n: number) =>
  "R " +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const input =
  "rounded-md border border-slate-300 bg-white px-3 py-2 tabular-nums";

function ToolDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      aria-labelledby="broker-tool-title"
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id="broker-tool-title" className="text-lg font-semibold">
          {title}
        </h2>
        <button
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}

function ShareText({ text, label }: { text: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-2">
      <textarea
        readOnly
        aria-label="Shareable summary"
        value={text}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
        rows={10}
      />
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setMessage("Copied to clipboard.");
          } catch {
            setMessage("Select the summary and copy it manually.");
          }
        }}
        className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white"
      >
        {label}
      </button>
      <p role="status" className="text-sm text-slate-600">
        {message}
      </p>
    </div>
  );
}

export function LandlordReport({
  rows,
  date,
  onClose,
}: {
  rows: ReportLease[];
  date: string;
  onClose: () => void;
}) {
  const landlords = [
    ...new Set(rows.map(({ l }) => l.landlord).filter(Boolean)),
  ].sort();
  const [landlord, setLandlord] = useState(landlords[0] ?? "");
  const leases = rows.filter(({ l }) => l.landlord === landlord);
  const open = leases.filter(
    ({ l }) =>
      l.followUp?.stage !== "Renewed" && l.followUp?.stage !== "Vacating",
  );
  const expiries = leases
    .filter(({ daysLeft }) => daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const awaiting = open.filter(({ l }) => l.followUp?.stage === "Contacted");
  const negotiating = open.filter(
    ({ l }) => l.followUp?.stage === "Negotiating",
  );
  const escalations = leases
    .filter(({ escIn, l }) => escIn >= 0 && escIn <= 30 && l.escalation > 0)
    .sort((a, b) => a.escIn - b.escIn);
  const atRisk = open.filter(
    ({ daysLeft, noticeBy }) => daysLeft <= 90 || noticeBy <= 30,
  );
  const lines = (
    items: ReportLease[],
    describe: (item: ReportLease) => string,
  ) =>
    items.length
      ? items.map((item) => "• " + describe(item)).join("\n")
      : "None";
  const name = ({ l }: ReportLease) =>
    [l.property, l.unit, l.tenant].filter(Boolean).join(" · ");
  const report = [
    `Weekly landlord report | ${date}\n${landlord}`,
    `Monthly rent at risk: ${money(atRisk.reduce((sum, { l }) => sum + l.rent, 0))} across ${atRisk.length} open renewals. Includes leases expiring within 90 days or with notice due within 30 days or overdue.`,
    "Expiries in the next 90 days\n" +
      lines(expiries, (item) => name(item) + " · " + item.l.leaseEnd),
    "Awaiting tenant response\n" + lines(awaiting, name),
    "Negotiations in progress\n" + lines(negotiating, name),
    "Rent increases in the next 30 days\n" +
      lines(
        escalations,
        (item) =>
          `${name(item)} · ${item.l.escalationDate} · ${money(item.l.rent)} to ${money(item.newRent)}`,
      ),
  ].join("\n\n");
  return (
    <ToolDialog title="Weekly landlord report" onClose={onClose}>
      {landlords.length ? (
        <div className="space-y-4">
          <label className="grid gap-1 text-sm font-medium">
            Landlord
            <select
              className={input}
              value={landlord}
              onChange={(event) => setLandlord(event.target.value)}
            >
              {landlords.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <ShareText
            key={landlord}
            text={report}
            label="Copy landlord report"
          />
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Add an active lease with a landlord to generate a report.
        </p>
      )}
    </ToolDialog>
  );
}

export function RenewalComparison({
  lease,
  onClose,
}: {
  lease: Lease;
  onClose: () => void;
}) {
  const contractual =
    Math.round(lease.rent * (1 + lease.escalation / 100) * 100) / 100;
  const [proposal, setProposal] = useState(String(contractual));
  const [free, setFree] = useState("0");
  const proposed = Number(proposal);
  const freeMonths = Number(free);
  const valid =
    proposal !== "" &&
    free !== "" &&
    Number.isFinite(proposed) &&
    proposed >= 0 &&
    Number.isFinite(freeMonths) &&
    freeMonths >= 0 &&
    freeMonths <= 12;
  const annual = proposed * (12 - freeMonths);
  const difference = annual - contractual * 12;
  const summary = [
    `Renewal comparison | ${lease.tenant}`,
    `Premises: ${[lease.property, lease.unit].filter(Boolean).join(", ")}`,
    `Current base rent: ${money(lease.rent)} per month`,
    `Contractual escalation: ${lease.escalation}% to ${money(contractual)} per month`,
    `Proposed base rent: ${money(proposed)} per month, with ${freeMonths} rent-free months in year one`,
    `Proposed year-one base rent: ${money(annual)}`,
    `Year-one difference vs contractual escalation: ${money(difference)}`,
    `Year-one difference vs current rent: ${money(annual - lease.rent * 12)}`,
    "Base rent only. VAT, recoveries and other charges are excluded.",
  ].join("\n");
  return (
    <ToolDialog title="Compare renewal terms" onClose={onClose}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Proposed monthly rent (ZAR)
          <input
            className={input}
            type="number"
            min={0}
            step="0.01"
            value={proposal}
            onChange={(event) => setProposal(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Rent-free months in year one
          <input
            className={input}
            type="number"
            min={0}
            max={12}
            step="0.5"
            value={free}
            onChange={(event) => setFree(event.target.value)}
          />
        </label>
      </div>
      {valid ? (
        <ShareText text={summary} label="Copy renewal comparison" />
      ) : (
        <p role="status" className="text-sm text-red-700">
          Enter valid rent and between 0 and 12 rent-free months.
        </p>
      )}
    </ToolDialog>
  );
}
