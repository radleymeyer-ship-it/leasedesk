"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { entityTypes, ficaFlags, ficaItems, leaseCompliance } from "@/lib/lease-compliance";
import type { EntityType, Lease } from "@/types/lease";

type Compliance = ReturnType<typeof leaseCompliance>;

export function ComplianceFields({
  value,
  onChange,
}: {
  value: Compliance;
  onChange: (value: Compliance) => void;
}) {
  const { entityType, ficaChecklist } = value;
  const inputClass = "h-9 rounded-md border border-zinc-300 bg-white px-3";
  return (
    <fieldset className="mx-5 mb-5 grid gap-3 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">FICA &amp; Lease Compliance</legend>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Entity type
          <select
            value={entityType}
            onChange={(event) => onChange({ ...value, entityType: event.target.value as EntityType })}
            className={inputClass}
          >
            {Object.entries(entityTypes).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...value, ficaChecklist: { ...ficaChecklist, ...ficaFlags(true) } })}
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          Mark all verified
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ficaItems(entityType).map(({ key, label }) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ficaChecklist[key]}
              onChange={(event) => onChange({
                ...value,
                ficaChecklist: { ...ficaChecklist, [key]: event.target.checked },
              })}
              className="mt-1 accent-emerald-700"
            />
            {label}
          </label>
        ))}
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Proof of address date
        <input
          type="date"
          max="9999-12-31"
          value={ficaChecklist.proofOfAddressDate}
          onChange={(event) => onChange({
            ...value,
            ficaChecklist: { ...ficaChecklist, proofOfAddressDate: event.target.value },
          })}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Compliance notes
        <textarea
          rows={2}
          value={ficaChecklist.complianceNotes}
          onChange={(event) => onChange({
            ...value,
            ficaChecklist: { ...ficaChecklist, complianceNotes: event.target.value },
          })}
          className="rounded-md border border-zinc-300 p-2"
        />
      </label>
    </fieldset>
  );
}

export function ComplianceDrawer({
  lease,
  onClose,
  onSave,
}: {
  lease: Lease;
  onClose: () => void;
  onSave: (value: Compliance) => boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(() => leaseCompliance(lease));
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSave(leaseCompliance(value))) onClose();
    else setError(true);
  }

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="compliance-drawer-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-lg bg-white text-zinc-900 shadow-xl backdrop:bg-zinc-900/50"
    >
      <form onSubmit={submit}>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 id="compliance-drawer-title" className="font-semibold">{lease.tenant}</h2>
          <button type="button" aria-label="Close compliance checklist" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <ComplianceFields value={value} onChange={setValue} />
        {error && <p role="alert" className="px-5 pb-3 text-sm text-red-700">Could not save compliance for this lease.</p>}
        <div className="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <button type="button" onClick={onClose} className="px-3 text-sm">Cancel</button>
          <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            Save compliance
          </button>
        </div>
      </form>
    </dialog>
  );
}
