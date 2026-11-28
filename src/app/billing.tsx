"use client";

import Script from "next/script";
import { proPlan } from "@/lib/pro-plan";
import { useEffect, useRef, useState } from "react";

type Paddle = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: {
    token: string;
    eventCallback: (event: { name: string }) => void;
  }) => void;
  Checkout: { open: (options: { transactionId: string }) => void };
};

type BillingState = {
  configured?: boolean;
  paidCheckoutAvailable?: boolean;
  pdfImportAvailable?: boolean;
  localPdfImport?: boolean;
  pdfImportMessage?: string;
  active?: boolean;
  workspaceId?: string | null;
  status?: string;
  trialEndsAt?: string | null;
  management?: { update_payment_method?: string; cancel?: string };
  error?: string;
};

declare global {
  interface Window {
    Paddle?: Paddle;
  }
}

const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const token =
  process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox" &&
  clientToken?.startsWith("test_")
    ? clientToken
    : undefined;
let initialized = false;

export function useBilling() {
  const [state, setState] = useState<BillingState>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then(setState)
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ error: "Could not check billing." });
      });
    return () => controller.abort();
  }, []);
  return { state, setState };
}

function TrialCountdown({ endsAt }: { endsAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const end = endsAt ? Date.parse(endsAt) : NaN;

  useEffect(() => {
    if (!Number.isFinite(end)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [end]);

  if (!Number.isFinite(end)) return "Trial active";
  const days = Math.ceil((end - now) / 86_400_000);
  if (days <= 0) return "Trial ended";
  return `${days} ${days === 1 ? "day" : "days"} left in your trial`;
}

export function Billing({ state, setState }: ReturnType<typeof useBilling>) {
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState<"trial" | "paid" | null>(null);
  const [message, setMessage] = useState("");
  const statusCheck = useRef<AbortController | null>(null);

  useEffect(() => () => statusCheck.current?.abort(), []);

  async function refresh(waitForCheckout = false) {
    statusCheck.current?.abort();
    const controller = new AbortController();
    statusCheck.current = controller;
    if (waitForCheckout) setMessage("Confirming checkout with Paddle…");
    try {
      const attempts = waitForCheckout ? 8 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 2000));
        if (controller.signal.aborted) return;
        const response = await fetch("/api/billing", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: BillingState = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok) setState(data);
        if (data.active && data.workspaceId) {
          setMessage("");
          return;
        }
        if (attempt === attempts - 1) {
          setMessage(
            data.error ||
              "If you just checked out, refresh billing in a moment.",
          );
        }
      }
    } catch {
      if (!controller.signal.aborted)
        setMessage("Could not check billing. Try again.");
    }
  }

  function initialize() {
    const paddle = window.Paddle;
    if (!token || !paddle) return;
    if (!initialized) {
      paddle.Environment.set("sandbox");
      paddle.Initialize({
        token,
        eventCallback: ({ name }) => {
          if (name === "checkout.completed") void refresh(true);
          if (name === "checkout.error")
            setMessage("Paddle could not open checkout. Try again.");
        },
      });
      initialized = true;
    }
    setReady(true);
  }

  async function checkout(mode: "trial" | "paid") {
    if (!window.Paddle || working) return;
    setWorking(mode);
    setMessage("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Checkout is unavailable.");
      window.Paddle.Checkout.open({ transactionId: data.transactionId });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Checkout is unavailable.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm"
      aria-label="LeaseDesk Pro billing"
    >
      {token && (
        <Script
          src="https://cdn.paddle.com/paddle/v2/paddle.js"
          onReady={initialize}
          onError={() => setMessage("Could not load Paddle checkout.")}
        />
      )}
      <div>
        <strong>LeaseDesk Pro</strong>
        <p className="text-zinc-600 tabular-nums">
          {proPlan.trialDays}-day free trial, then US${proPlan.monthlyAmount}{" "}
          per month
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {state.active && (
          <span className="font-medium text-emerald-800">
            {state.status === "trialing" ? (
              <TrialCountdown endsAt={state.trialEndsAt} />
            ) : (
              "Pro active"
            )}
          </span>
        )}
        {state.management?.update_payment_method && (
          <a
            className="underline"
            href={state.management.update_payment_method}
          >
            Update payment method
          </a>
        )}
        {state.management?.cancel && (
          <a className="underline" href={state.management.cancel}>
            Cancel subscription
          </a>
        )}
        {state.configured &&
          !state.active &&
          (!state.management || state.status === "canceled") && (
            <>
              <button
                onClick={() => checkout("trial")}
                disabled={!ready || working !== null}
                className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
              >
                {working === "trial" ? "Opening checkout…" : "Start free trial"}
              </button>
              {state.paidCheckoutAvailable && (
                <button
                  onClick={() => checkout("paid")}
                  disabled={!ready || working !== null}
                  aria-label="Upgrade to Pro and pay today"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {working === "paid" ? "Opening checkout…" : "Upgrade to Pro"}
                </button>
              )}
            </>
          )}
        {token && (
          <button onClick={() => refresh()} className="underline">
            Refresh billing
          </button>
        )}
      </div>
      <p
        role="status"
        className="w-full text-zinc-600"
        hidden={!(message || state.error || state.configured === false)}
      >
        {message ||
          state.error ||
          "Paddle checkout is unavailable in this workspace."}
      </p>
    </section>
  );
}
