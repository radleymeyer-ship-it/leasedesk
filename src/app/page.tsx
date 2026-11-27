"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  Copy,
  Download,
  Loader2,
  CalendarClock,
  Coins,
  Mail,
  MessageCircle,
  TrendingUp,
  Plus,
  Scale,
  Search,
  Send,
  Upload,
  X,
} from "lucide-react";

import Image from "next/image";
import { leaseVatRate, monthlyLeaseCharges } from "@/lib/lease-charges";
import { ficaFlags, ficaStatus, ficaTotal, leaseCompliance } from "@/lib/lease-compliance";
import {
  depositInterestRules,
  guaranteeAlert,
  leaseSecurity,
  securitySummary,
  securityTypes,
} from "@/lib/lease-security";
import { isLeaseDate, type Lease, type LeaseDraft } from "@/types/lease";
import { Billing, useBilling } from "./billing";
import { ComplianceDrawer, ComplianceFields } from "./lease-compliance";
import { LandlordReport, RenewalComparison } from "./broker-tools";
import { RenewalEmailDialog, stopRenewalEmail } from "./renewal-email";

type Status = "active" | "notice" | "expired";
type NavSection = "portfolio" | "renewals" | "defaults";
type FilterTab =
  | "active"
  | "all"
  | "arrears"
  | "renewals"
  | "escalations"
  | "expired"
  | "fica-incomplete";

/* ---------------------------------- Helpers --------------------------------- */

const MS = 86_400_000;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const startOfDay = (date: Date) =>
  new Date(dayFormatter.format(date) + "T00:00:00Z");
const offset = (base: Date, days: number) =>
  new Date(base.getTime() + days * MS).toISOString().slice(0, 10);
const diff = (base: Date, iso: string) =>
  (Date.parse(iso) - base.getTime()) / MS;
const fmt = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
const zar = (n: number) =>
  `R ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
function sampleLeases(t: Date): Lease[] {
  const L = (
    id: string,
    property: string,
    unit: string,
    tenant: string,
    tenantEmail: string,
    tenantPhone: string,
    landlord: string,
    landlordContact: string,
    rent: number,
    escalation: number,
    escIn: number,
    endIn: number,
    noticeDays: number,
    arrears = 0,
    arrearsDays = 0,
  ): Lease => ({
    id,
    property,
    unit,
    tenant,
    tenantEmail,
    tenantPhone,
    landlord,
    landlordContact,
    rent,
    escalation,
    escalationDate: offset(t, escIn),
    leaseEnd: offset(t, endIn),
    noticeDays,
    arrears,
    arrearsDays,
    entityType: tenant.endsWith(" CC") ? "close_corporation" : "company",
    ficaChecklist: {
      ...ficaFlags(true),
      beneficialOwnership: id !== "L-1042",
      proofOfAddress: id !== "L-1045",
      proofOfAddressDate: offset(t, id === "L-1045" ? -120 : -24),
      complianceNotes:
        id === "L-1042" ? "Awaiting CIPC beneficial ownership filing confirmation."
          : id === "L-1045" ? "Requested a recent proof of address." : "",
    },
  });
  const boland = [
    "Boland Property Holdings (Pty) Ltd",
    "Annelie Roux · 082 441 7730",
  ];
  const marine = [
    "Marine Drive Industrial Fund",
    "Gareth Fourie · 083 276 1190",
  ];
  return [
    L(
      "L-1041",
      "Tyger Valley Office Park",
      "Block C, Suite 204",
      "Brandt & Associates Inc.",
      "accounts@brandtlaw.co.za",
      "021 914 2260",
      boland[0],
      boland[1],
      48500,
      8,
      71,
      72,
      90,
    ),
    L(
      "L-1042",
      "Century City, Ratanga Junction Rd",
      "Shop 14",
      "Kopano Coffee Roasters CC",
      "thabo@kopanocoffee.co.za",
      "064 208 9915",
      "Canal Walk Retail Trust",
      "Pieter Naidoo · 021 551 0044",
      32750,
      7.5,
      25,
      26,
      60,
      65500,
      47,
    ),
    L(
      "L-1043",
      "Paarden Eiland, 12 Marine Drive",
      "Unit 6 (Warehouse)",
      "Atlantic Cold Chain (Pty) Ltd",
      "ops@atlanticcold.co.za",
      "021 511 7783",
      marine[0],
      marine[1],
      87200,
      9,
      219,
      587,
      120,
    ),
    L(
      "L-1044",
      "Claremont, Main Road",
      "Ground Floor, No. 88",
      "Sunrise Pharmacy (Pty) Ltd",
      "manager@sunrisepharmacy.co.za",
      "021 683 4412",
      "Southern Suburbs Property Co.",
      "Fatima Davids · 072 903 5518",
      41300,
      8.5,
      99,
      100,
      90,
    ),
    L(
      "L-1045",
      "Tyger Valley, Willie van Schoor Dr",
      "Shop 3",
      "Ember Grill & Bar CC",
      "finance@embergrill.co.za",
      "082 770 3321",
      boland[0],
      boland[1],
      27900,
      8,
      40,
      -20,
      60,
      83700,
      78,
    ),
    L(
      "L-1046",
      "Century City, Bridgeway Precinct",
      "Level 2, Office 2.07",
      "Nexus Digital (Pty) Ltd",
      "billing@nexusdigital.co.za",
      "010 140 5567",
      "Bridgeway Commercial Properties",
      "Lindiwe Mokoena · 079 335 8802",
      56400,
      7,
      310,
      314,
      90,
      11280,
      12,
    ),
    L(
      "L-1047",
      "Paarden Eiland, 4 Voortrekker Rd",
      "Unit 2",
      "Cape Fabricators (Pty) Ltd",
      "admin@capefab.co.za",
      "021 511 0925",
      marine[0],
      marine[1],
      63800,
      8.5,
      12,
      131,
      90,
    ),
  ];
}
const renewalStages = [
  "Not started",
  "Contacted",
  "Replied",
  "Negotiating",
  "Renewed",
  "Vacating",
] as const;
type FollowUp = {
  stage: (typeof renewalStages)[number];
  date: string;
  notes: string;
};
type StoredLease = Lease & { followUp?: FollowUp; automationOwner?: string };

function derive(l: StoredLease, t: Date) {
  const daysLeft = diff(t, l.leaseEnd);
  const noticeBy = daysLeft - l.noticeDays;
  const escIn = l.escalationDate ? diff(t, l.escalationDate) : Infinity;
  const status: Status =
    daysLeft < 0 ? "expired" : noticeBy <= 30 ? "notice" : "active";
  return {
    l,
    daysLeft,
    noticeBy,
    escIn,
    status,
    charges: monthlyLeaseCharges(l),
    security: leaseSecurity(l),
    fica: ficaStatus(l),
    newRent: l.rent * (1 + l.escalation / 100),
    noticeDate: offset(new Date(l.leaseEnd), -l.noticeDays),
  };
}
type Row = ReturnType<typeof derive>;
/* Logo-matched semantic badges: Emerald (Green), Amber (Orange/Yellow), Red */ const BADGE: Record<
  Status,
  { text: string; dot: string; cls: string }
> = {
  active: {
    text: "Active",
    dot: "bg-[#10B981]",
    cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  },
  notice: {
    text: "Renewal due",
    dot: "bg-[#F59E0B]",
    cls: "bg-amber-50 text-amber-800 ring-amber-500/30",
  },
  expired: {
    text: "Expired",
    dot: "bg-[#EF4444]",
    cls: "bg-red-50 text-red-700 ring-red-600/20",
  },
};

const demoStorageKey = "leasedesk.leases";
const blankLease: LeaseDraft = {
  property: "",
  unit: "",
  tenant: "",
  tenantEmail: "",
  tenantPhone: "",
  landlord: "",
  landlordContact: "",
  rent: null,
  operatingCosts: 0,
  municipalCharges: 0,
  vatApplicable: true,
  escalation: null,
  escalationDate: "",
  leaseEnd: "",
  noticeDays: 90,
  arrears: 0,
  arrearsDays: 0,
};

async function extractLease(file: File): Promise<LeaseDraft> {
  if (file.size > 4 * 1024 * 1024)
    throw new Error("Choose a PDF no larger than 4 MB.");
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/extract", { method: "POST", body });
  if (response.status === 413)
    throw new Error("Choose a PDF no larger than 4 MB.");
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(
      data?.error ||
        "Could not read this PDF. Try again or add the lease manually.",
    );
  }
  return data;
}

/* ---------------------------------- Page ---------------------------------- */

type Parse =
  | { k: "idle" }
  | { k: "busy"; name: string }
  | { k: "ok"; name: string }
  | { k: "err"; msg: string };

export default function Page() {
  const billing = useBilling();
  const workspaceId = billing.state.active ? billing.state.workspaceId : null;
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-zinc-900 antialiased tabular-nums">
      <Workspace
        key={workspaceId ?? "demo"}
        workspaceId={workspaceId ?? null}
        billing={billing.state}
      />
      <div className="px-4 pb-6 sm:px-6 md:ml-[72px]">
        <div className="mx-auto max-w-[1600px]">
          <Billing {...billing} />
        </div>
      </div>
    </div>
  );
}

function Workspace({
  workspaceId,
  billing,
}: {
  workspaceId: string | null;
  billing: ReturnType<typeof useBilling>["state"];
}) {
  const storageKey = workspaceId
    ? `leasedesk.workspace.${workspaceId}.leases`
    : demoStorageKey;
  const [today, setToday] = useState<Date | null>(null);
  const [leases, setLeases] = useState<StoredLease[]>([]);
  const [storageError, setStorageError] = useState("");
  const canUseWorkspace =
    Boolean(workspaceId) ||
    billing.configured === false ||
    billing.localPdfImport === true;

  useEffect(() => {
    function load() {
      const date = startOfDay(new Date());
      let records: StoredLease[] = [];
      try {
        const saved = localStorage.getItem(storageKey);
        records =
          saved === null
            ? workspaceId
              ? []
              : sampleLeases(date)
            : JSON.parse(saved);
        if (
          !Array.isArray(records) ||
          records.some(
            (record) =>
              !record ||
              !isLeaseDate(record.leaseEnd) ||
              !Number.isSafeInteger(record.noticeDays),
          )
        )
          throw new Error("Invalid records");
        if (saved === null)
          localStorage.setItem(storageKey, JSON.stringify(records));
        setLeases(records);
      } catch {
        setStorageError("Lease records could not be loaded from this browser.");
      }
      setToday(date);
    }
    const frame = requestAnimationFrame(load);
    const timer = window.setInterval(
      () => setToday(startOfDay(new Date())),
      60000,
    );
    function sync(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) load();
    }
    window.addEventListener("storage", sync);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      window.removeEventListener("storage", sync);
    };
  }, [storageKey, workspaceId]);

  function persist(update: (records: StoredLease[]) => StoredLease[]) {
    try {
      const saved = localStorage.getItem(storageKey);
      const next = update(saved === null ? leases : JSON.parse(saved));
      localStorage.setItem(storageKey, JSON.stringify(next));
      setLeases(next);
      setStorageError("");
      return true;
    } catch {
      setStorageError("Could not save lease records in this browser.");
      return false;
    }
  }
  const [nav, setNav] = useState<NavSection>("portfolio");
  const [q, setQ] = useState("");
  const [view, setView] = useState<FilterTab>("all");
  const [parse, setParse] = useState<Parse>({ k: "idle" });

  // Modals
  const [letterLease, setLetterLease] = useState<Lease | null>(null);
  const [reminderRow, setReminderRow] = useState<Row | null>(null);
  const [complianceLease, setComplianceLease] = useState<Lease | null>(null);
  const [followUpLease, setFollowUpLease] = useState<StoredLease | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [comparisonLease, setComparisonLease] = useState<Lease | null>(null);
  const [emailRow, setEmailRow] = useState<Row | null>(null);

  async function stopAutomation(lease: StoredLease) {
    if (!lease.automationOwner) return true;
    try {
      if (await stopRenewalEmail(lease.id, lease.automationOwner)) return true;
    } catch {}
    setStorageError(
      "Sign in to the account that queued the renewal emails, then try again.",
    );
    return false;
  }
  const [editor, setEditor] = useState<{
    lease: LeaseDraft;
    id?: string;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () => (today ? leases.map((l) => derive(l, today)) : []),
    [leases, today],
  );
  const live = useMemo(
    () => rows.filter((r) => r.status !== "expired"),
    [rows],
  );

  const metrics = useMemo(() => {
    const owing = rows.filter((r) => r.l.arrears > 0);
    return {
      rentRoll: live.reduce((s, r) => s + r.charges.baseRent, 0),
      monthlyBilling: live.reduce((s, r) => s + r.charges.total, 0),
      arrears: owing.reduce((s, r) => s + r.l.arrears, 0),
      owingCount: owing.length,
      noticesDue: live.filter((r) => r.noticeBy <= 30).length,
      escRows: live.filter((r) => r.escIn >= 0 && r.escIn <= 60),
    };
  }, [rows, live]);

  const escUplift = metrics.escRows.reduce(
    (s, r) => s + (r.newRent - r.l.rent),
    0,
  );

  const counts: Record<FilterTab, number> = {
    all: rows.length,
    active: live.length,

    arrears: rows.filter((r) => r.l.arrears > 0).length,
    renewals: rows.filter((r) => r.status === "notice").length,
    escalations: rows.filter(
      (r) => r.status !== "expired" && r.escIn >= 0 && r.escIn <= 60,
    ).length,
    expired: rows.filter((r) => r.status === "expired").length,
    "fica-incomplete": rows.filter((r) => !r.fica.complete).length,
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const keep = (r: Row) =>
      view === "all" ||
      (view === "active" && r.status !== "expired") ||
      (view === "arrears" && r.l.arrears > 0) ||
      (view === "renewals" && r.status === "notice") ||
      (view === "escalations" &&
        r.status !== "expired" &&
        r.escIn >= 0 &&
        r.escIn <= 60) ||
      (view === "expired" && r.status === "expired") ||
      (view === "fica-incomplete" && !r.fica.complete);
    return rows
      .filter(keep)
      .filter(
        (r) =>
          !s ||
          [r.l.tenant, r.l.landlord, r.l.property, r.l.unit]
            .join(" ")
            .toLowerCase()
            .includes(s),
      )
      .sort(
        (a, b) => b.l.arrearsDays - a.l.arrearsDays || a.daysLeft - b.daysLeft,
      );
  }, [rows, q, view]);

  const renewalRows = useMemo(
    () =>
      rows
        .filter((r) => r.status !== "expired")
        .sort((a, b) => a.noticeBy - b.noticeBy),
    [rows],
  );

  const todayISO = today ? offset(today, 0) : "";
  const guaranteeWarnings = rows
    .flatMap((row) => {
      const alert = guaranteeAlert(row.security.guaranteeExpiry, todayISO);
      return alert ? [{ row, alert }] : [];
    })
    .sort((a, b) =>
      a.row.security.guaranteeExpiry.localeCompare(
        b.row.security.guaranteeExpiry,
      ),
    );
  const dueFollowUps = renewalRows.filter(
    ({ l }) =>
      l.followUp?.date &&
      l.followUp.date <= todayISO &&
      l.followUp.stage !== "Renewed" &&
      l.followUp.stage !== "Vacating",
  );
  const visibleRenewals = dueOnly ? dueFollowUps : renewalRows;

  const arrearsRows = useMemo(
    () =>
      rows
        .filter((r) => r.l.arrears > 0)
        .sort((a, b) => b.l.arrearsDays - a.l.arrearsDays),
    [rows],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setParse({ k: "busy", name: f.name });
    try {
      const data = await extractLease(f);
      setEditor({ lease: data });
      setParse({ k: "ok", name: f.name });
    } catch (err) {
      setParse({
        k: "err",
        msg: err instanceof Error ? err.message : "Could not read this PDF.",
      });
    }
  }
  function openPdfPicker() {
    if (canUseWorkspace && billing.pdfImportAvailable) {
      setParse({ k: "idle" });
      fileRef.current?.click();
      return;
    }
    setParse({
      k: "err",
      msg: billing.error
        ? "Could not verify PDF upload access. Refresh billing and try again."
        : billing.configured === undefined
          ? "Checking PDF upload access. Try again in a moment."
          : (billing.pdfImportMessage ??
            "PDF import is unavailable in this demo. Use Add lease to enter the details manually."),
    });
  }
  return (
    <div>
      {" "}
      {/* Top Accent Strip matching the 3 logo colors (Red, Amber, Emerald) */}{" "}
      <nav
        aria-label="LeaseDesk sections"
        className="sticky top-0 z-30 flex items-center gap-2 bg-[#182532] px-4 py-2 text-white md:fixed md:inset-y-0 md:left-0 md:w-[72px] md:flex-col md:px-2 md:py-5"
      >
        <NavPill
          active={nav === "portfolio"}
          onClick={() => {
            setNav("portfolio");
            setView("all");
            setQ("");
          }}
          icon={<Building2 size={21} />}
          label="All Leases & Contacts"
        />
        <NavPill
          active={nav === "renewals"}
          onClick={() => setNav("renewals")}
          icon={<BellRing size={21} />}
          label="Renewal & Escalation Reminders"
        />
        <NavPill
          active={nav === "defaults"}
          onClick={() => setNav("defaults")}
          icon={<Scale size={21} />}
          label="Legal Default Letters"
        />
      </nav>
      <header className="border-b border-slate-200 bg-white md:ml-[72px]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Image
              src="/logo.svg"
              alt="LeaseDesk"
              width={161}
              height={32}
              unoptimized
              className="h-8 w-auto"
            />
            <span className="hidden border-l border-slate-200 pl-4 text-sm text-slate-600 xl:block">
              Tenant records, renewal alerts &amp; instant default notices
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={!today || !canUseWorkspace || parse.k === "busy"}
              onClick={() => setEditor({ lease: blankLease })}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              {" "}
              <Plus size={15} /> Add lease{" "}
            </button>{" "}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={onFile}
            />{" "}
            <button
              type="button"
              onClick={openPdfPicker}
              disabled={parse.k === "busy"}
              aria-describedby="pdf-import-description"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-3.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {" "}
              <Upload size={15} className="text-[#10B981]" /> Upload lease
              PDF{" "}
            </button>{" "}
            <span className="sr-only" id="pdf-import-description">
              Lease PDFs are sent to Google Gemini for extraction.
            </span>
          </div>{" "}
        </div>{" "}
      </header>
      <main className="space-y-5 px-4 py-5 sm:px-6 md:ml-[72px]">
        <div className="mx-auto max-w-[1600px] space-y-5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {nav === "portfolio"
              ? "Lease portfolio"
              : nav === "renewals"
                ? "Renewals & escalations"
                : "Arrears & default notices"}
          </h1>
          <ParseStatus s={parse} />

          {storageError && (
            <p role="alert" className="text-sm text-red-700">
              {storageError}
            </p>
          )}
          <fieldset
            disabled={!canUseWorkspace}
            className="min-w-0 space-y-5 disabled:opacity-75"
          >
            <section
              aria-label="Portfolio metrics"
              className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4"
            >
              <MetricCard
                label="Active leases"
                value={String(live.length)}
                note={`${new Set(live.map(({ l }) => l.property.trim().toLowerCase())).size} properties`}
                icon={<Building2 size={23} />}
                onClick={() => {
                  setNav("portfolio");
                  setView("active");
                  setQ("");
                }}
              />
              <MetricCard
                label="Renewal notices due"
                value={String(metrics.noticesDue)}
                note="Overdue or due within 30 days"
                icon={<CalendarClock size={23} />}
                onClick={() => {
                  setNav("portfolio");
                  setView("renewals");
                  setQ("");
                }}
              />
              <MetricCard
                label="Monthly rent roll"
                value={zar(metrics.rentRoll)}
                note={`Base rent · ${zar(metrics.monthlyBilling)} total billed`}
                icon={<Coins size={23} />}
                onClick={() => {
                  setNav("portfolio");
                  setView("active");
                  setQ("");
                }}
              />
              <MetricCard
                label="Upcoming escalations"
                value={String(metrics.escRows.length)}
                note={`+${zar(escUplift)} monthly · next 60 days`}
                icon={<TrendingUp size={23} />}
                onClick={() => {
                  setNav("portfolio");
                  setView("escalations");
                  setQ("");
                }}
              />
            </section>
            {/* VIEW 1: ALL LEASES & CONTACTS */}
            {nav === "portfolio" && (
              <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_15rem] 2xl:grid-cols-[minmax(0,1fr)_17rem]">
                <section
                  aria-label="Lease register"
                  className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 px-4 pt-4">
                    <h2 className="text-base font-semibold text-slate-900">
                      Lease register
                    </h2>
                    <button
                      type="button"
                      disabled={!shown.length}
                      onClick={() => downloadLeaseRegister(shown, todayISO)}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Download size={15} /> Export CSV
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 border-b border-zinc-200 p-3.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-sm">
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                      />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search tenant, landlord, or building..."
                        className="h-9 w-full rounded-md border border-zinc-200 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          { key: "all", label: "All" },
                          { key: "active", label: "Active" },

                          { key: "renewals", label: "Renewal due" },
                          { key: "arrears", label: "In arrears" },
                          { key: "escalations", label: "Escalating soon" },
                          { key: "expired", label: "Expired" },
                          { key: "fica-incomplete", label: "FICA incomplete" },
                        ] as { key: FilterTab; label: string }[]
                      ).map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setView(t.key)}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${view === t.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
                        >
                          {" "}
                          {t.label}{" "}
                          <span
                            className={`tabular-nums ${view === t.key ? "text-zinc-300" : "text-zinc-400"}`}
                          >
                            {counts[t.key]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="relative overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Scrollable lease table"
                  >
                    <table className="w-full min-w-[790px] border-collapse text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                        <tr>
                          <th scope="col" className="px-3 py-3">
                            Property
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Tenant &amp; landlord
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-3 whitespace-nowrap"
                          >
                            Base rent
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Escalation
                          </th>
                          <th
                            scope="col"
                            className="px-3 py-3 whitespace-nowrap"
                          >
                            Notice deadline
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Status
                          </th>
                          <th scope="col" className="px-3 py-3">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80">
                        {shown.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="p-10 text-center text-slate-600"
                            >
                              {workspaceId && today && leases.length === 0 ? (
                                <div className="space-y-2">
                                  <p className="font-semibold text-slate-900">
                                    Your workspace is ready
                                  </p>
                                  <p>
                                    Upload a lease PDF or add a lease manually
                                    to get started.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditor({ lease: blankLease })
                                    }
                                    className="mt-2 rounded-md bg-zinc-900 px-3 py-2 font-medium text-white"
                                  >
                                    Add your first lease
                                  </button>
                                </div>
                              ) : (
                                "No leases match your filters."
                              )}
                            </td>
                          </tr>
                        )}
                        {shown.map((r) => {
                          const { l } = r;
                          const expired = r.status === "expired";
                          return (
                            <tr key={l.id} className="hover:bg-slate-50">
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">
                                  {l.property}
                                </div>
                                {l.unit && (
                                  <div className="text-xs text-slate-600">
                                    {l.unit}
                                  </div>
                                )}
                                <div className="mt-1 text-xs text-slate-600">
                                  {securitySummary(r.security, zar)}
                                </div>
                                <GuaranteeWarning
                                  expiry={r.security.guaranteeExpiry}
                                  today={todayISO}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <div className="font-medium text-slate-900">
                                  {l.tenant}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {l.landlord}
                                </div>
                                {(l.tenantEmail || l.tenantPhone) && (
                                  <div className="break-all text-xs text-slate-600">
                                    {l.tenantEmail || l.tenantPhone}
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 font-medium">
                                {zar(l.rent)}
                                <div className="text-xs font-normal text-slate-600">
                                  {zar(r.charges.total)} billed
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className="font-medium text-emerald-800">
                                  {pct(l.escalation)}
                                </span>
                                {l.escalationDate && (
                                  <div className="whitespace-nowrap text-xs text-slate-600">
                                    {zar(r.newRent)} · {fmt(l.escalationDate)}
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3">
                                <div
                                  className={
                                    r.status === "notice"
                                      ? "font-medium text-amber-800"
                                      : "font-medium"
                                  }
                                >
                                  {fmt(r.noticeDate)}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {expired ? "Ended" : "Ends"} {fmt(l.leaseEnd)}
                                </div>
                                {!expired && (
                                  <div className="text-xs text-slate-600">
                                    {r.daysLeft === 0
                                      ? "Expires today"
                                      : `${r.daysLeft} days left`}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${BADGE[r.status].cls}`}
                                >
                                  {BADGE[r.status].text}
                                </span>
                                <div className="mt-1">
                                  <button
                                    type="button"
                                    aria-label={`FICA ${r.fica.count}/${ficaTotal} for ${l.tenant}, open compliance checklist`}
                                    onClick={() => setComplianceLease(l)}
                                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                                      r.fica.complete ? BADGE.active.cls : BADGE.notice.cls
                                    } hover:underline`}
                                  >
                                    FICA {r.fica.count}/{ficaTotal}
                                  </button>
                                </div>
                                {l.arrears > 0 && (
                                  <div className="mt-1 whitespace-nowrap text-xs text-red-700">
                                    Owes {zar(l.arrears)}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    className="rounded px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                    onClick={() =>
                                      setEditor({ id: l.id, lease: l })
                                    }
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                                    onClick={() => setReminderRow(r)}
                                  >
                                    Remind
                                  </button>
                                  {l.arrears > 0 && (
                                    <button
                                      type="button"
                                      className="rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                      onClick={() => setLetterLease(l)}
                                    >
                                      Default letter
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                <aside
                  aria-label="Portfolio actions"
                  className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"
                >
                  <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div
                      className="flex gap-2 text-emerald-800"
                      aria-hidden="true"
                    >
                      <MessageCircle size={20} />
                      <Mail size={20} />
                    </div>
                    <h2 className="mt-3 font-semibold text-slate-900">
                      Renewal reminders
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                      Review notice deadlines and prepare email or WhatsApp
                      drafts.
                    </p>
                    <button
                      type="button"
                      onClick={() => setNav("renewals")}
                      className="mt-4 w-full rounded-lg bg-emerald-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
                    >
                      Review reminders
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportOpen(true)}
                      className="mt-3 text-sm font-semibold text-emerald-900 hover:underline"
                    >
                      Weekly landlord report
                    </button>
                  </section>
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Scale size={17} className="text-red-700" /> Arrears &amp;
                      defaults
                    </div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {zar(metrics.arrears)}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {metrics.owingCount} tenants in arrears
                    </p>
                    <button
                      type="button"
                      onClick={() => setNav("defaults")}
                      className="mt-3 text-sm font-semibold text-red-700 hover:underline"
                    >
                      View default notices
                    </button>
                  </section>
                </aside>
              </div>
            )}
            {/* VIEW 2: DEDICATED RENEWAL & ESCALATION REMINDERS */}
            {nav === "renewals" && (
              <section className="rounded-lg border border-zinc-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900">
                      Contract Renewal &amp; Escalation Reminders
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Review lease deadlines, bank guarantees and tenant
                      follow-ups.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={dueOnly}
                      onChange={(event) => setDueOnly(event.target.checked)}
                    />
                    Follow-ups due ({dueFollowUps.length})
                  </label>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                    onClick={() => setReportOpen(true)}
                  >
                    Weekly landlord report
                  </button>
                </div>
                {guaranteeWarnings.length > 0 && (
                  <section
                    aria-label="Bank guarantee alerts"
                    className="space-y-2 border-b border-amber-200 bg-amber-50 px-5 py-4"
                  >
                    <h3 className="text-sm font-semibold text-slate-900">
                      Bank guarantee alerts ({guaranteeWarnings.length})
                    </h3>
                    <ul className="space-y-2">
                      {guaranteeWarnings.map(({ row, alert }) => (
                        <li
                          key={row.l.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {row.l.tenant} ·{" "}
                            {securitySummary(row.security, zar)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditor({ lease: row.l, id: row.l.id })
                            }
                            className={`font-semibold underline ${alert.expired ? "text-red-800" : "text-amber-900"}`}
                          >
                            {alert.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <div className="divide-y divide-zinc-100">
                  {visibleRenewals.length === 0 && (
                    <p className="p-5 text-sm text-zinc-600">
                      {dueOnly
                        ? "No follow-ups due."
                        : "No active leases to review."}
                    </p>
                  )}
                  {visibleRenewals.map((r) => (
                    <div
                      key={r.l.id}
                      className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-900">
                            {r.l.tenant}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[r.status].cls}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${BADGE[r.status].dot}`}
                            />{" "}
                            {BADGE[r.status].text}{" "}
                          </span>{" "}
                        </div>{" "}
                        <p className="text-xs text-zinc-600">
                          {" "}
                          {r.l.property}, {r.l.unit} · Landlord:{" "}
                          <span className="font-medium">
                            {r.l.landlord}
                          </span>{" "}
                        </p>{" "}
                        <p className="text-xs text-zinc-500 tabular-nums">
                          {" "}
                          Lease ends{" "}
                          <strong className="text-zinc-800">
                            {fmt(r.l.leaseEnd)}
                          </strong>{" "}
                          · Notice deadline{" "}
                          <strong className="text-amber-700">
                            {fmt(r.noticeDate)}
                          </strong>{" "}
                          ({r.l.noticeDays}-day notice clause) · Expires in{" "}
                          {r.daysLeft} days · Next escalation:
                          <strong className="text-[#10B981]">
                            +{pct(r.l.escalation)}
                          </strong>{" "}
                          on {fmt(r.l.escalationDate)} · Projected rent{" "}
                          {zar(r.newRent)}{" "}
                        </p>
                        <p className="text-sm font-medium text-slate-800">
                          {r.l.followUp?.stage ?? "Not started"}
                          {r.l.followUp?.date &&
                            ` · Follow up ${fmt(r.l.followUp.date)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                          onClick={() => setFollowUpLease(r.l)}
                        >
                          Track follow-up
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                          onClick={() => setEmailRow(r)}
                        >
                          Automated email
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                          onClick={() => setComparisonLease(r.l)}
                        >
                          Compare renewal
                        </button>
                        <button
                          onClick={() => setReminderRow(r)}
                          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-white hover:bg-zinc-800"
                        >
                          {" "}
                          <Send size={13} className="text-[#F59E0B]" /> Draft
                          Renewal Reminder
                        </button>
                      </div>
                    </div>
                  ))}{" "}
                </div>{" "}
              </section>
            )}{" "}
            {/* VIEW 3: DEDICATED LEGAL DEFAULT LETTERS */}{" "}
            {nav === "defaults" && (
              <section className="rounded-lg border border-zinc-200 bg-white">
                {" "}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-4">
                  {" "}
                  <div>
                    {" "}
                    <h2 className="text-base font-semibold text-zinc-900">
                      Legal Default &amp; Breach Notices
                    </h2>{" "}
                    <p className="text-xs text-zinc-500">
                      {" "}
                      Draft a South African letter of demand using saved lease
                      and contact details.
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
                <div className="divide-y divide-zinc-100">
                  {" "}
                  {arrearsRows.length === 0 && (
                    <p className="p-5 text-sm text-zinc-600">
                      No tenants in arrears.
                    </p>
                  )}
                  {arrearsRows.map((r) => (
                    <div
                      key={r.l.id}
                      className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center"
                    >
                      {" "}
                      <div className="space-y-1">
                        {" "}
                        <div className="flex items-center gap-2.5">
                          {" "}
                          <span className="font-semibold text-zinc-900">
                            {r.l.tenant}
                          </span>{" "}
                          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-[#EF4444] ring-1 ring-inset ring-red-600/20 tabular-nums">
                            {" "}
                            {zar(r.l.arrears)} overdue ({r.l.arrearsDays}{" "}
                            days){" "}
                          </span>{" "}
                        </div>{" "}
                        <p className="text-xs text-zinc-600">
                          {" "}
                          {r.l.property}, {r.l.unit} · {r.l.tenantEmail} ·{" "}
                          {r.l.tenantPhone}{" "}
                        </p>{" "}
                        <p className="text-xs text-zinc-500">
                          {" "}
                          Landlord: {r.l.landlord} ({r.l.landlordContact}){" "}
                        </p>{" "}
                      </div>{" "}
                      <button
                        onClick={() => setLetterLease(r.l)}
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-[#EF4444] px-4 text-xs font-semibold text-white hover:bg-red-600"
                      >
                        {" "}
                        <Scale size={14} /> Issue Legal Default Letter{" "}
                      </button>{" "}
                    </div>
                  ))}{" "}
                </div>{" "}
              </section>
            )}{" "}
            {!workspaceId && (
              <button
                type="button"
                className="text-sm text-zinc-600 underline"
                disabled={!today || parse.k === "busy"}
                onClick={async () => {
                  if (
                    today &&
                    window.confirm(
                      "Replace all saved leases in this browser with sample data?",
                    )
                  ) {
                    const tracked = leases.filter(
                      (lease) => lease.automationOwner,
                    );
                    for (const lease of tracked) {
                      if (!(await stopAutomation(lease))) return;
                    }
                    if (persist(() => sampleLeases(today))) {
                      setNav("portfolio");
                      setView("all");
                      setQ("");
                    }
                  }
                }}
              >
                Reset sample data
              </button>
            )}
          </fieldset>
        </div>
      </main>{" "}
      {/* Modals */}{" "}
      {letterLease && (
        <LetterModal lease={letterLease} onClose={() => setLetterLease(null)} />
      )}{" "}
      {reportOpen && (
        <LandlordReport
          rows={rows}
          date={todayISO}
          onClose={() => setReportOpen(false)}
        />
      )}
      {comparisonLease && (
        <RenewalComparison
          lease={comparisonLease}
          onClose={() => setComparisonLease(null)}
        />
      )}
      {emailRow && (
        <RenewalEmailDialog
          lease={emailRow.l}
          deadline={emailRow.noticeDate}
          closed={
            emailRow.l.followUp?.stage === "Renewed" ||
            emailRow.l.followUp?.stage === "Vacating" ||
            emailRow.l.followUp?.stage === "Replied"
          }
          onClose={() => setEmailRow(null)}
          onQueued={(owner) => {
            const saved = persist((records) =>
              records.map((record) =>
                record.id === emailRow.l.id
                  ? { ...record, automationOwner: owner }
                  : record,
              ),
            );
            if (!saved) void stopRenewalEmail(emailRow.l.id, owner);
            return saved;
          }}
          onReply={() =>
            persist((records) =>
              records.map((record) =>
                record.id === emailRow.l.id
                  ? {
                      ...record,
                      followUp: {
                        stage: "Replied",
                        date: "",
                        notes: record.followUp?.notes ?? "",
                      },
                    }
                  : record,
              ),
            )
          }
        />
      )}
      {followUpLease && (
        <FollowUpDialog
          lease={followUpLease}
          onClose={() => setFollowUpLease(null)}
          onSave={async (followUp) => {
            if (
              ["Renewed", "Vacating", "Replied"].includes(followUp.stage) &&
              !(await stopAutomation(followUpLease))
            )
              return;
            const saved = persist((records) =>
              records.map((record) =>
                record.id === followUpLease.id
                  ? { ...record, followUp }
                  : record,
              ),
            );
            if (saved) setFollowUpLease(null);
          }}
        />
      )}
      {reminderRow && (
        <ReminderModal row={reminderRow} onClose={() => setReminderRow(null)} />
      )}{" "}
      {complianceLease && (
        <ComplianceDrawer
          lease={complianceLease}
          onClose={() => setComplianceLease(null)}
          onSave={(value) => persist((records) => {
            if (!records.some((record) => record.id === complianceLease.id))
              throw new Error("Lease no longer exists");
            return records.map((record) =>
              record.id === complianceLease.id ? { ...record, ...value } : record,
            );
          })}
        />
      )}
      {editor && canUseWorkspace && (
        <AddLeaseModal
          initial={editor.lease}
          editing={Boolean(editor.id)}
          onClose={() => setEditor(null)}
          onSave={async (details) => {
            const lease = { ...details, id: editor.id ?? crypto.randomUUID() };
            const existing = leases.find((row) => row.id === lease.id);
            if (existing?.automationOwner) {
              const affectsEmail = (
                [
                  "tenant",
                  "tenantEmail",
                  "landlord",
                  "unit",
                  "property",
                  "noticeDays",
                  "leaseEnd",
                ] as const
              ).some((key) => existing[key] !== lease[key]);
              if (affectsEmail && !(await stopAutomation(existing)))
                return false;
            }
            const saved = persist((records) =>
              editor.id
                ? records.map((record) =>
                    record.id === editor.id ? { ...record, ...lease } : record,
                  )
                : [lease, ...records],
            );
            if (saved) {
              setEditor(null);
              setNav("portfolio");
              setView("all");
              setQ("");
            }
            return saved;
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Subcomponents --------------------------------- */

function downloadLeaseRegister(rows: Row[], date: string) {
  const records = [
    [
      "Property",
      "Unit",
      "Tenant",
      "Landlord",
      "Monthly rent (ZAR)",
      "Annual escalation (%)",
      "Next escalation",
      "Lease expiry",
      "Notice deadline",
      "Status",
      "Arrears (ZAR)",
      "Renewal stage",
      "Next follow-up",
      "Operating costs ex VAT (ZAR/month)",
      "Municipal charges ex VAT (ZAR/month)",
      "VAT applicable",
      "VAT (ZAR/month)",
      "Total billing (ZAR/month)",
      "Security type",
      "Security amount (ZAR)",
      "Bank guarantee expiry",
      "Deposit interest rule",
      "FICA completion status",
      "FICA missing items",
    ],
    ...rows.map(({ l, noticeDate, status, charges, security, fica }) => [
      l.property,
      l.unit,
      l.tenant,
      l.landlord,
      l.rent,
      l.escalation,
      l.escalationDate,
      l.leaseEnd,
      noticeDate,
      BADGE[status].text,
      l.arrears,
      l.followUp?.stage ?? "Not started",
      l.followUp?.date ?? "",
      charges.operatingCosts,
      charges.municipalCharges,
      charges.vatApplicable ? "Yes" : "No",
      charges.vat,
      charges.total,
      securityTypes[security.securityType],
      security.securityAmount,
      security.guaranteeExpiry,
      depositInterestRules[security.depositInterestRule],
      fica.complete ? "Complete" : `Incomplete (${fica.count}/${ficaTotal})`,
      fica.missing.join("; "),
    ]),
  ];
  const csv = records
    .map((row) =>
      row
        .map((cell) => {
          if (typeof cell === "number") return String(cell);
          const text = cell.replace(/[\r\n\t\u0000]/g, " ");
          const safe = /^[=+\-@＝＋－＠]/u.test(text.trimStart())
            ? "Text: " + text
            : text;
          return '"' + safe.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `leasedesk-register-${date}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function GuaranteeWarning({
  expiry,
  today,
}: {
  expiry: string;
  today: string;
}) {
  const alert = guaranteeAlert(expiry, today);
  return alert ? (
    <div
      className={`text-xs font-semibold ${alert.expired ? "text-red-700" : "text-amber-800"}`}
    >
      {alert.text}
    </div>
  ) : null;
}

function FollowUpDialog({
  lease,
  onClose,
  onSave,
}: {
  lease: StoredLease;
  onClose: () => void;
  onSave: (followUp: FollowUp) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="follow-up-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <h2 id="follow-up-title" className="text-lg font-semibold">
        Track renewal follow-up
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {lease.tenant} · {premises(lease)}
      </p>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const stage = renewalStages.find(
            (value) => value === form.get("stage"),
          );
          const date = String(form.get("date") ?? "");
          if (stage && (!date || isLeaseDate(date))) {
            onSave({
              stage,
              date,
              notes: String(form.get("notes") ?? "")
                .trim()
                .slice(0, 1000),
            });
          }
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          Renewal stage
          <select
            name="stage"
            defaultValue={lease.followUp?.stage ?? renewalStages[0]}
            className="rounded-md border border-slate-300 bg-white p-2"
          >
            {renewalStages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Next follow-up date
          <input
            name="date"
            type="date"
            max="9999-12-31"
            defaultValue={lease.followUp?.date ?? ""}
            className="rounded-md border border-slate-300 p-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Internal notes
          <textarea
            name="notes"
            rows={3}
            maxLength={1000}
            defaultValue={lease.followUp?.notes ?? ""}
            className="rounded-md border border-slate-300 p-2"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
          >
            Save follow-up
          </button>
        </div>
      </form>
    </dialog>
  );
}

function NavPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      onClick={onClick}
      className={`flex h-11 min-w-11 items-center justify-center rounded-lg border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${active ? "border-emerald-300/30 bg-white/10 text-emerald-300" : "border-transparent text-slate-300 hover:bg-white/10 hover:text-white"}`}
    >
      {icon}
    </button>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:p-4"
    >
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 sm:size-11"
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {value}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-slate-600">
            {note}
          </div>
        </div>
      </div>
    </button>
  );
}

function ParseStatus({ s }: { s: Parse }) {
  if (s.k === "idle") return null;
  const base = "flex items-center gap-1.5 text-sm font-medium";
  if (s.k === "busy")
    return (
      <span
        role="status"
        className={`${base}
 text-zinc-600`}
      >
        <Loader2 size={14} className="animate-spin text-[#F59E0B]" /> Reading{" "}
        {s.name}...
      </span>
    );
  if (s.k === "ok")
    return (
      <span
        role="status"
        className={`${base}
 text-[#10B981]`}
      >
        {" "}
        <Check size={14} /> Read {s.name}. Review the extracted details before
        saving.
      </span>
    );
  return (
    <span
      role="status"
      className={`${base}
 text-[#EF4444]`}
    >
      <AlertTriangle size={14} /> {s.msg}
    </span>
  );
}

/* --------------------- 1-Click Legal Default Letter Modal --------------------- */

function LetterModal({
  lease,
  onClose,
}: {
  lease: Lease;
  onClose: () => void;
}) {
  const [arrears, setArrears] = useState(lease.arrears);
  const [cure, setCure] = useState(7);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const date = fmt(offset(startOfDay(new Date()), 0));
  const charges = monthlyLeaseCharges(lease);

  const text = `WITHOUT PREJUDICE — NOTICE OF BREACH AND DEMAND FOR PAYMENT


Date: ${date}
Our Ref: ${lease.id}

TO: ${lease.tenant}
Email: ${lease.tenantEmail}
Tel: ${lease.tenantPhone}

Premises: ${premises(lease)}

Landlord: ${lease.landlord}

Dear Sir/Madam

1. We refer to the written Lease Agreement between ${lease.landlord} ("the Landlord") and ${lease.tenant} ("the Tenant") in respect of ${premises(lease)}. The current monthly obligation comprises:
   Base rent (ex VAT): ${zar(charges.baseRent)}
   Operating cost recoveries (ex VAT): ${zar(charges.operatingCosts)}
   Municipal charge recoveries (ex VAT): ${zar(charges.municipalCharges)}
   Subtotal (ex VAT): ${zar(charges.subtotal)}${charges.vatApplicable ? `\n   VAT at ${leaseVatRate}%: ${zar(charges.vat)}` : ""}
   Total monthly obligation: ${zar(charges.total)}


2. The Tenant is in breach of its obligations under the Lease Agreement by failing to pay the amount due on the due date. As at ${date}, the outstanding arrears balance demanded is ${zar(arrears)}, as reflected in the tenant account. This balance is separate from the current monthly charge breakdown above.

3. In terms of the Breach Clause of the Lease Agreement, demand is hereby made that the Tenant remedy this breach within ${cure} days
 of receipt of this notice by paying ${zar(arrears)} in cleared funds into the Landlord's nominated account, quoting reference ${lease.id}
.

4. Should the Tenant fail to remedy the breach within the stipulated ${cure}-day period, the Landlord reserves the right to pursue remedies available under the Lease Agreement and applicable law.


Yours faithfully

_______________________
For and on behalf of ${lease.landlord}
Contact: ${lease.landlordContact}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Clipboard unavailable. Select and copy the draft text.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-zinc-900/50 p-4 sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
        <div className="h-1 w-full bg-[#EF4444]" />
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Issue Legal Default / Breach Letter
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {lease.tenant} · {lease.unit}, {lease.property}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-zinc-200 bg-zinc-50 px-5 py-3.5 sm:max-w-md">
          <label className="text-xs font-medium text-zinc-700">
            <span className="mb-1 block">Arrears Amount (ZAR)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={arrears}
              onChange={(e) =>
                setArrears(Math.max(0, Number(e.target.value) || 0))
              }
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm tabular-nums focus:border-zinc-900 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-zinc-700">
            <span className="mb-1 block">Days to Remedy Breach</span>
            <input
              type="number"
              min={1}
              value={cure}
              onChange={(e) =>
                setCure(Math.max(1, Math.trunc(Number(e.target.value)) || 1))
              }
              className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm tabular-nums focus:border-zinc-900 focus:outline-none"
            />
          </label>
        </div>

        <div className="px-5 py-4">
          <p className="mb-2 text-sm text-zinc-600">
            Check the cure period and service requirements against the lease
            before sending.
          </p>
          {copyError && (
            <p role="alert" className="text-sm text-red-700">
              {copyError}
            </p>
          )}
          <pre className="max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50/50 p-4 font-sans text-[13px] leading-relaxed text-zinc-800">
            {text}
          </pre>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3.5">
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Close
          </button>
          <button
            onClick={copy}
            disabled={arrears <= 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {copied ? (
              <Check size={15} className="text-[#10B981]" />
            ) : (
              <Copy size={15} />
            )}
            {copied ? "Copied to clipboard" : "Copy legal notice"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------- Renewal Reminder Preview Modal --------------------- */

function premises(lease: Lease) {
  return [lease.unit, lease.property].filter(Boolean).join(", ");
}

function ReminderModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [feedback, setFeedback] = useState("");
  const { l } = row;
  const location = premises(l);
  const subject = `Lease renewal reminder — ${location}`;
  const deadline = row.noticeBy < 0 ? "was" : "is";
  const timing = `Your lease at ${location} expires on ${fmt(l.leaseEnd)}. The renewal notice deadline ${deadline} ${fmt(row.noticeDate)}.`;
  const escalation = l.escalationDate
    ? `The scheduled ${pct(l.escalation)} escalation brings the projected monthly rent to ${zar(row.newRent)} on ${fmt(l.escalationDate)}.`
    : "";
  const body = [
    `Dear ${l.tenant},`,
    timing,
    escalation,
    "Please let us know whether you intend to renew.",
    `Kind regards,\n${l.landlord}\n${l.landlordContact}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const email = `Subject: ${subject}\n\n${body}`;
  const message = [
    `Hi ${l.tenant},`,
    timing,
    escalation,
    "Please let us know whether you intend to renew.",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback("Clipboard unavailable. Select and copy the draft text.");
    }
  }

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="reminder-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-xl backdrop:bg-zinc-900/50"
    >
      <div className="space-y-4 border-t-4 border-[#F59E0B] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="reminder-title" className="font-semibold">
              Contract renewal reminder
            </h2>
            <p className="text-sm text-zinc-600">
              {[l.tenantEmail, l.tenantPhone].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <pre className="whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-4 font-sans text-sm">
          {email}
        </pre>
        <p className="text-sm text-zinc-600" role="status">
          {feedback}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => copy(email, "Email")}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
          >
            Copy email
          </button>
          <button
            type="button"
            onClick={() => copy(message, "WhatsApp message")}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
          >
            Copy WhatsApp message
          </button>
        </div>
      </div>
    </dialog>
  );
}

/* --------------------- Manual Tenant / Landlord Loader Modal --------------------- */

const leaseFields = [
  { name: "tenant", label: "Tenant name", required: true },
  { name: "property", label: "Property / building", required: true },
  { name: "tenantEmail", label: "Tenant email", type: "email" },
  { name: "tenantPhone", label: "Tenant phone / WhatsApp", type: "tel" },
  { name: "landlord", label: "Landlord entity", required: true },
  { name: "landlordContact", label: "Landlord contact" },
  { name: "unit", label: "Unit / suite" },
  {
    name: "rent",
    label: "Monthly rent (ZAR)",
    type: "number",
    step: "0.01",
    required: true,
  },
  {
    name: "escalation",
    label: "Annual escalation (%)",
    type: "number",
    step: "0.01",
    required: true,
  },
  {
    name: "operatingCosts",
    label: "Operating costs per month (ZAR, ex VAT)",
    type: "number",
    step: "0.01",
  },
  {
    name: "municipalCharges",
    label: "Municipal charges per month (ZAR, ex VAT)",
    type: "number",
    step: "0.01",
  },
  { name: "escalationDate", label: "Next escalation date", type: "date" },
  {
    name: "leaseEnd",
    label: "Lease expiry date",
    type: "date",
    required: true,
  },
  {
    name: "noticeDays",
    label: "Renewal notice days",
    type: "number",
    step: "1",
    required: true,
  },
  {
    name: "arrears",
    label: "Arrears (ZAR)",
    type: "number",
    step: "0.01",
    required: true,
  },
  {
    name: "arrearsDays",
    label: "Days in arrears",
    type: "number",
    step: "1",
    required: true,
  },
] as const satisfies ReadonlyArray<{
  name: keyof LeaseDraft;
  label: string;
  type?: string;
  step?: string;
  required?: boolean;
}>;

function AddLeaseModal({
  initial,
  editing,
  onClose,
  onSave,
}: {
  initial: LeaseDraft;
  editing: boolean;
  onClose: () => void;
  onSave: (lease: Omit<Lease, "id">) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const initialSecurity = leaseSecurity(initial);
  const [compliance, setCompliance] = useState(() => leaseCompliance(initial));
  const [securityType, setSecurityType] = useState(
    initialSecurity.securityType,
  );

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (name: keyof LeaseDraft) =>
      String(data.get(name) ?? "").trim();
    const tenant = read("tenant");
    const property = read("property");
    const landlord = read("landlord");
    const escalation = Number(read("escalation"));
    const escalationDate = read("escalationDate");
    if (!tenant || !property || !landlord) {
      setError("Enter the tenant, landlord and property names.");
      return;
    }
    if (
      !isLeaseDate(read("leaseEnd")) ||
      (escalationDate && !isLeaseDate(escalationDate))
    ) {
      setError("Enter valid lease dates.");
      return;
    }
    if (escalation > 0 && !escalationDate) {
      setError("Enter the next escalation date or set the escalation to 0%.");
      return;
    }
    const saved = await onSave({
      property,
      unit: read("unit"),
      tenant,
      tenantEmail: read("tenantEmail"),
      tenantPhone: read("tenantPhone"),
      landlord,
      landlordContact: read("landlordContact"),
      rent: Number(read("rent")),
      operatingCosts: Number(read("operatingCosts")),
      municipalCharges: Number(read("municipalCharges")),
      vatApplicable: data.has("vatApplicable"),
      escalation,
      escalationDate,
      leaseEnd: read("leaseEnd"),
      noticeDays: Number(read("noticeDays")),
      arrears: Number(read("arrears")),
      arrearsDays: Number(read("arrearsDays")),
      ...leaseCompliance(compliance),
      ...leaseSecurity({
        securityType,
        securityAmount: Number(read("securityAmount")),
        guaranteeExpiry: read("guaranteeExpiry"),
        depositInterestRule: read("depositInterestRule"),
        securityNotes: read("securityNotes"),
      }),
    });
    if (!saved) setError("Could not save this lease in your browser.");
  }

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="lease-editor-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-xl backdrop:bg-zinc-900/50"
    >
      <form onSubmit={submit} className="border-t-4 border-[#10B981]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 id="lease-editor-title" className="font-semibold">
            {editing
              ? "Edit lease details"
              : "Load tenant, landlord & lease details"}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {leaseFields.map((field) => (
            <label key={field.name} className="grid gap-1 text-sm font-medium">
              {field.label}
              <input
                name={field.name}
                defaultValue={
                  initial[field.name] ??
                  (field.name === "operatingCosts" ||
                  field.name === "municipalCharges"
                    ? 0
                    : "")
                }
                type={"type" in field ? field.type : "text"}
                required={"required" in field && field.required}
                min={"step" in field ? 0 : undefined}
                step={"step" in field ? field.step : undefined}
                className="h-9 rounded-md border border-zinc-300 px-3 tabular-nums"
              />
            </label>
          ))}
          <label className="flex items-start gap-2 text-sm font-medium sm:col-span-2">
            <input
              name="vatApplicable"
              type="checkbox"
              defaultChecked={initial.vatApplicable ?? true}
              className="mt-1"
            />
            <span>
              Apply {leaseVatRate}% VAT to base rent and recoveries. Enter
              monthly charges exclusive of VAT.
            </span>
          </label>
        </div>
        <fieldset className="mx-5 mb-5 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">
            Deposit / Bank Guarantee
          </legend>
          <label className="grid gap-1 text-sm font-medium">
            Security type
            <select
              value={securityType}
              onChange={(event) =>
                setSecurityType(
                  leaseSecurity({ securityType: event.target.value })
                    .securityType,
                )
              }
              className="h-9 rounded-md border border-zinc-300 bg-white px-3"
            >
              {Object.entries(securityTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Security amount (ZAR)
            <input
              name="securityAmount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={initialSecurity.securityAmount}
              disabled={securityType === "none"}
              className="h-9 rounded-md border border-zinc-300 px-3 disabled:bg-slate-100"
            />
          </label>
          <label
            className={
              securityType === "bank_guarantee"
                ? "grid gap-1 text-sm font-medium"
                : "hidden"
            }
          >
            Bank guarantee expiry
            <input
              name="guaranteeExpiry"
              type="date"
              max="9999-12-31"
              defaultValue={initialSecurity.guaranteeExpiry}
              disabled={securityType !== "bank_guarantee"}
              className="h-9 rounded-md border border-zinc-300 px-3"
            />
          </label>
          <label
            className={
              securityType === "cash_deposit"
                ? "grid gap-1 text-sm font-medium"
                : "hidden"
            }
          >
            Deposit interest rule
            <select
              name="depositInterestRule"
              defaultValue={
                initialSecurity.securityType === "cash_deposit"
                  ? initialSecurity.depositInterestRule
                  : "interest_bearing_tenant"
              }
              disabled={securityType !== "cash_deposit"}
              className="h-9 rounded-md border border-zinc-300 bg-white px-3"
            >
              {Object.entries(depositInterestRules).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Security notes
            <textarea
              name="securityNotes"
              rows={2}
              maxLength={1000}
              defaultValue={initialSecurity.securityNotes}
              placeholder="Issuing bank, reference number or renewal top-up"
              className="rounded-md border border-zinc-300 p-2"
            />
          </label>
        </fieldset>
        <ComplianceFields value={compliance} onChange={setCompliance} />
        {error && (
          <p role="alert" className="px-5 pb-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <button type="button" onClick={onClose} className="px-3 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save lease record
          </button>
        </div>
      </form>
    </dialog>
  );
}
