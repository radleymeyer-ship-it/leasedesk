"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Lease } from "@/types/lease";

let client: SupabaseClient | undefined;
export function renewalClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) client ??= createClient(url, key);
  return client;
}

export async function stopRenewalEmail(leaseId: string, owner: string) {
  const db = renewalClient();
  if (!db) return false;
  const { data } = await db.auth.getSession();
  if (data.session?.user.id !== owner) return false;
  const { error } = await db.rpc("manage_renewal_email", {
    p_lease: leaseId,
    p_action: "cancel",
  });
  return !error;
}

type Delivery = {
  id: string;
  step: number;
  state: string;
  scheduled_at: string;
  sent_at: string | null;
  error: string | null;
  test_send: boolean;
};
type Action = "schedule" | "pause" | "resume" | "cancel" | "reply";
const displayTime = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});
const stages = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
  replied: "Reply recorded",
};
const field = "rounded-md border border-slate-300 bg-white px-3 py-2";
const button =
  "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50";

export function RenewalEmailDialog({
  lease,
  deadline,
  closed,
  onClose,
  onQueued,
  onReply,
}: {
  lease: Lease;
  deadline: string;
  closed: boolean;
  onClose: () => void;
  onQueued: (owner: string) => void;
  onReply: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [signedIn, setSignedIn] = useState<string | null>();
  const [message, setMessage] = useState("");
  const [state, setState] = useState<keyof typeof stages>();
  const [history, setHistory] = useState<Delivery[]>([]);
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh(db: SupabaseClient) {
    const [sequence, deliveries] = await Promise.all([
      db
        .from("renewal_email_sequences")
        .select("state")
        .eq("lease_id", lease.id)
        .maybeSingle(),
      db
        .from("renewal_email_deliveries")
        .select("id,step,state,scheduled_at,sent_at,error,test_send")
        .eq("lease_id", lease.id)
        .order("scheduled_at", { ascending: false })
        .limit(30),
    ]);
    if (sequence.error || deliveries.error) {
      setLoaded(false);
      setMessage("Could not load the email queue. Try refreshing.");
      return;
    }
    setState(sequence.data?.state as keyof typeof stages | undefined);
    setHistory(deliveries.data);
    setLoaded(true);
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const db = renewalClient();
    const subscription = db?.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session?.user.email ?? null);
    });
    return () => {
      subscription?.data.subscription.unsubscribe();
      element?.close();
    };
  }, []);

  useEffect(() => {
    const db = renewalClient();
    if (!signedIn || !db) return;
    let active = true;
    const reload = () => {
      if (active) void refresh(db);
    };
    const timer = window.setTimeout(reload, 0);
    const interval = window.setInterval(reload, 15000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
    // The lease is fixed for the lifetime of this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const db = renewalClient();
    if (!db || working) return;
    const values = new FormData(event.currentTarget);
    const credentials = {
      email: String(values.get("email")),
      password: String(values.get("password")),
    };
    const signup =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "signup";
    setWorking(true);
    try {
      const response = signup
        ? await db.auth.signUp(credentials)
        : await db.auth.signInWithPassword(credentials);
      setMessage(
        response.error?.message ??
          (signup && !response.data.session
            ? "Check your inbox to confirm your account, then sign in."
            : ""),
      );
    } catch {
      setMessage("Sign-in could not be completed. Try again.");
    } finally {
      setWorking(false);
    }
  }

  async function manage(action: Action, values?: FormData) {
    const db = renewalClient();
    if (!db || working) return;
    setWorking(true);
    setMessage("");
    try {
      const { error } = await db.rpc("manage_renewal_email", {
        p_lease: lease.id,
        p_action: action,
        p_details: values
          ? {
              recipient: lease.tenantEmail.trim(),
              tenant: lease.tenant,
              landlord: lease.landlord,
              property: [lease.unit, lease.property].filter(Boolean).join(", "),
              deadline,
              before: Number(values.get("before")),
              wait: Number(values.get("wait")),
            }
          : {},
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (action === "schedule") {
        const {
          data: { session },
        } = await db.auth.getSession();
        if (session) onQueued(session.user.id);
      }
      if (action === "reply") onReply();
      await refresh(db);
    } catch {
      setMessage("Could not update the email queue. Try again.");
    } finally {
      setWorking(false);
    }
  }

  const pending = history.some(({ state }) =>
    ["queued", "sending"].includes(state),
  );
  const savedLease = /^[a-f0-9-]{36}$/i.test(lease.id);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="renewal-email-title"
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="renewal-email-title" className="text-lg font-semibold">
            Automated tenant email
          </h2>
          <p className="text-sm text-slate-600">
            {lease.tenant} · {lease.tenantEmail || "No email on file"}
          </p>
        </div>
        <button className={button} onClick={onClose}>
          Close
        </button>
      </div>
      {!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? (
        <p className="mt-4 text-sm">
          Supabase sign-in is unavailable in this environment.
        </p>
      ) : signedIn === undefined ? (
        <p className="mt-4 text-sm">Checking your sign-in…</p>
      ) : !signedIn ? (
        <form className="mt-4 grid gap-3 text-sm" onSubmit={authenticate}>
          <label className="grid gap-1">
            Broker email
            <input
              name="email"
              type="email"
              autoComplete="email"
              className={field}
              required
            />
          </label>
          <label className="grid gap-1">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className={field}
              required
            />
          </label>
          <div className="flex gap-2">
            <button disabled={working} className={button}>
              Sign in
            </button>
            <button disabled={working} value="signup" className={button}>
              Create account
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-all text-slate-600">{signedIn}</span>
            <button
              type="button"
              className={button}
              disabled={working}
              onClick={() => {
                setLoaded(false);
                setHistory([]);
                setState(undefined);
                void renewalClient()?.auth.signOut();
              }}
            >
              Sign out
            </button>
          </div>
          <p className="text-slate-600">
            Messages are queued at 09:00 South Africa time. A delivery worker
            needs to be enabled by the workspace administrator.
          </p>
          {!loaded && (
            <button
              type="button"
              className={button}
              onClick={() => {
                const db = renewalClient();
                if (db) void refresh(db);
              }}
            >
              Refresh queue
            </button>
          )}
          {state && (
            <p className="font-semibold">Sequence status · {stages[state]}</p>
          )}
          {pending && (
            <div className="flex flex-wrap gap-2">
              {state === "active" && (
                <button
                  className={button}
                  disabled={working}
                  onClick={() => manage("pause")}
                >
                  Pause emails
                </button>
              )}
              {state === "paused" && !closed && (
                <button
                  className={button}
                  disabled={working}
                  onClick={() => manage("resume")}
                >
                  Resume emails
                </button>
              )}
              <button
                className={button}
                disabled={working}
                onClick={() => manage("reply")}
              >
                Record reply and stop
              </button>
              <button
                className={button}
                disabled={working}
                onClick={() => manage("cancel")}
              >
                Cancel queued emails
              </button>
            </div>
          )}
          {loaded &&
            !pending &&
            (!savedLease || closed || !lease.tenantEmail ? (
              <p className="text-slate-600">
                Queue email for an active lease you added, with a tenant email
                address on file.
              </p>
            ) : (
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void manage("schedule", new FormData(event.currentTarget));
                }}
              >
                <p className="font-medium">Notice deadline · {deadline}</p>
                <label className="grid gap-1">
                  First email, days before notice deadline
                  <input
                    name="before"
                    type="number"
                    min={0}
                    max={365}
                    defaultValue={14}
                    required
                    className={field}
                  />
                </label>
                <label className="grid gap-1">
                  Second email, days after the first
                  <input
                    name="wait"
                    type="number"
                    min={1}
                    max={90}
                    defaultValue={7}
                    required
                    className={field}
                  />
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" required className="mt-1" /> I’ve
                  verified the recipient and lease notice deadline.
                </label>
                <button disabled={working} className={button}>
                  Queue renewal emails
                </button>
              </form>
            ))}
          {history.length > 0 && (
            <section>
              <h3 className="font-semibold">Delivery log</h3>
              <ul className="mt-2 divide-y divide-slate-200 rounded border border-slate-200">
                {history.map((item) => (
                  <li key={item.id} className="px-3 py-2">
                    <strong>
                      {item.step === 1 ? "First reminder" : "Follow-up"}
                    </strong>{" "}
                    ·{" "}
                    {item.test_send
                      ? "Accepted for test delivery"
                      : item.state === "sent"
                        ? "Accepted by provider"
                        : item.state}{" "}
                    ·{" "}
                    {displayTime.format(
                      new Date(item.sent_at ?? item.scheduled_at),
                    )}
                    {item.error && (
                      <div className="text-red-700">{item.error}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
    </dialog>
  );
}
