import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type Delivery = {
  id: string;
  run_id: string;
  owner_id: string;
  lease_id: string;
  recipient: string;
  tenant: string;
  property: string;
  landlord: string;
  notice_deadline: string;
  step: number;
  attempts: number;
  first_attempt: string;
};

export async function POST(request: Request) {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (
    !secret ||
    secret.length < 32 ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.RENEWAL_EMAIL_FROM;
  const testTo = process.env.RENEWAL_EMAIL_TEST_TO;
  const live = process.env.RENEWAL_EMAIL_LIVE === "true";
  const owners = (process.env.RENEWAL_EMAIL_ALLOWED_USERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !url ||
    !serviceKey ||
    !apiKey ||
    !sender ||
    (!live && !testTo) ||
    !owners.length
  ) {
    return Response.json(
      { error: "Renewal email is disabled until configured." },
      { status: 503 },
    );
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("claim_renewal_email", {
    p_owners: owners,
  });
  if (error)
    return Response.json(
      { error: "Could not claim a delivery." },
      { status: 503 },
    );
  const delivery = (data as Delivery[])[0];
  if (!delivery) return Response.json({ processed: 0 });

  // Confirm the delivery is still eligible immediately before calling the provider.
  const [sequence, claim] = await Promise.all([
    db
      .from("renewal_email_sequences")
      .select("state")
      .eq("owner_id", delivery.owner_id)
      .eq("lease_id", delivery.lease_id)
      .single(),
    db
      .from("renewal_email_deliveries")
      .select("state,attempts")
      .eq("id", delivery.id)
      .single(),
  ]);
  if (sequence.error || claim.error)
    return Response.json(
      { error: "Could not verify the delivery." },
      { status: 503 },
    );
  if (
    claim.data.state !== "sending" ||
    claim.data.attempts !== delivery.attempts
  )
    return Response.json({ processed: 0 });
  const update = (changes: object) =>
    db
      .from("renewal_email_deliveries")
      .update(changes)
      .eq("id", delivery.id)
      .eq("state", "sending")
      .eq("attempts", delivery.attempts)
      .select("id");
  if (sequence.data.state !== "active") {
    const result = await update({
      state: sequence.data.state === "paused" ? "queued" : "cancelled",
      lease_until: null,
    });
    return Response.json(
      { processed: 0 },
      { status: result.error ? 503 : 200 },
    );
  }

  let providerId: string | undefined;
  let failure = "Email delivery interrupted or retry window expired.";
  let retry = false;
  if (
    delivery.attempts <= 3 &&
    Date.now() - Date.parse(delivery.first_attempt) < 23 * 3600000
  ) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "leasedesk-renewal/" + delivery.id,
        },
        body: JSON.stringify({
          from: sender,
          to: [live ? delivery.recipient : testTo],
          subject:
            (live ? "" : "[Test] ") +
            (delivery.step === 1
              ? "Lease renewal reminder"
              : "Lease renewal follow-up"),
          text: [
            "Hello " + delivery.tenant + ",",
            "We’re following up about the lease at " +
              delivery.property +
              ". The renewal notice deadline on record is " +
              delivery.notice_deadline +
              ".",
            "Please reply to let us know whether you’d like to discuss renewal.",
            "Kind regards,\n" + delivery.landlord,
          ].join("\n\n"),
        }),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (response.ok) {
        const result = await response.json();
        if (typeof result.id === "string") providerId = result.id;
      }
      failure = "Email provider returned HTTP " + response.status + ".";
      retry = response.status === 429 || response.status >= 500;
    } catch {
      failure = "Email provider could not be reached.";
      retry = true;
    }
  }

  const retryAt = new Date(Date.now() + 5 * 60000).toISOString();
  const state = providerId
    ? "sent"
    : retry && delivery.attempts < 3
      ? "queued"
      : "failed";
  const result = await update({
    state,
    lease_until: null,
    next_attempt: retryAt,
    sent_at: providerId ? new Date().toISOString() : null,
    provider_id: providerId ?? null,
    error: providerId ? null : failure,
    test_send: Boolean(providerId && !live),
  });
  if (result.error)
    return Response.json(
      { error: "Could not record the outcome." },
      { status: 503 },
    );
  if (result.data.length && state === "failed" && delivery.step === 1) {
    const skipped = await db
      .from("renewal_email_deliveries")
      .update({
        state: "failed",
        error: "Skipped because the first email failed.",
      })
      .eq("run_id", delivery.run_id)
      .eq("step", 2)
      .eq("state", "queued");
    if (skipped.error)
      return Response.json(
        { error: "Could not mark the follow-up as skipped." },
        { status: 503 },
      );
  }
  return Response.json({ processed: 1, state });
}
