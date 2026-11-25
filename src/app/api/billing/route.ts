import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/request-security";
import { proPlan } from "@/lib/pro-plan";
import {
  billingConfigured,
  billingReference,
  cookieOptions,
  getMembership,
  paddle,
  sessionCookie,
  transactionCookie,
  type Transaction,
} from "@/lib/billing";

const headers = { "Cache-Control": "no-store" };
const unavailable = () =>
  Response.json(
    { error: "Paddle billing is temporarily unavailable." },
    { headers, status: 503 },
  );

export async function GET() {
  const configured = billingConfigured();
  const pdfImportAvailable =
    Boolean(process.env.GEMINI_API_KEY) &&
    (configured || process.env.NODE_ENV === "development");
  if (!configured)
    return Response.json(
      { configured, active: false, pdfImportAvailable },
      { headers },
    );
  try {
    const { active, status, management } = await getMembership();
    return Response.json(
      { configured, active, status, management, pdfImportAvailable },
      { headers },
    );
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Start checkout from LeaseDesk." },
      { status: 403 },
    );
  }
  if (!billingConfigured()) return unavailable();

  try {
    const current = await getMembership();
    if (current.transaction?.subscription_id && current.status !== "canceled") {
      return Response.json(
        { error: "Manage your existing subscription in Paddle." },
        { headers, status: 409 },
      );
    }
    if (current.transaction && ["draft", "ready"].includes(current.status)) {
      return Response.json(
        { transactionId: current.transaction.id },
        { headers },
      );
    }
    if (
      current.status === "paid" ||
      (current.status === "completed" && !current.management)
    ) {
      return Response.json(
        {
          error:
            "Paddle is confirming your subscription. Refresh billing shortly.",
        },
        { headers, status: 409 },
      );
    }

    const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
    const price = await paddle<{
      status: string;
      unit_price: { amount: string; currency_code: string };
      billing_cycle?: { interval: string; frequency: number };
      trial_period?: {
        interval: string;
        frequency: number;
        unit_price?: { amount: string };
        requires_payment_method?: boolean;
      };
    }>("/prices/" + priceId);
    if (
      price.status !== "active" ||
      price.unit_price.amount !== String(proPlan.monthlyAmount * 100) ||
      price.unit_price.currency_code !== proPlan.currency ||
      price.billing_cycle?.interval !== "month" ||
      price.billing_cycle.frequency !== 1 ||
      price.trial_period?.interval !== "day" ||
      price.trial_period.frequency !== proPlan.trialDays ||
      Number(price.trial_period.unit_price?.amount ?? 0) !== 0 ||
      price.trial_period.requires_payment_method === false
    ) {
      return Response.json(
        {
          error: `Configure the Paddle Pro price for ${proPlan.currency} ${proPlan.monthlyAmount} monthly with a ${proPlan.trialDays}-day free trial.`,
        },
        { headers, status: 503 },
      );
    }
    const jar = await cookies();
    const existingSecret = jar.get(sessionCookie)?.value;
    const secret =
      existingSecret && /^[a-f0-9]{64}$/.test(existingSecret)
        ? existingSecret
        : randomBytes(32).toString("hex");
    const transaction = await paddle<Transaction>("/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: "automatic",
      custom_data: { leasedesk: billingReference(secret) },
    });
    jar.set(sessionCookie, secret, cookieOptions);
    jar.set(transactionCookie, transaction.id, cookieOptions);
    return Response.json({ transactionId: transaction.id }, { headers });
  } catch {
    return unavailable();
  }
}
