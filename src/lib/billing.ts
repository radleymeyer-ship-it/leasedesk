import { createHash } from "node:crypto";
import { cookies } from "next/headers";

const secureCookies = process.env.NODE_ENV === "production";
const cookiePrefix = secureCookies ? "__Host-" : "";
export const sessionCookie = cookiePrefix + "leasedesk_billing";
export const transactionCookie = cookiePrefix + "leasedesk_transaction";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: secureCookies,
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
} as const;

export function billingConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox" &&
      process.env.PADDLE_API_KEY?.includes("_sdbx") &&
      /^pri_[a-z0-9]{26}$/.test(
        process.env.NEXT_PUBLIC_PADDLE_PRICE_ID ?? "",
      ) &&
      process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.startsWith("test_"),
  );
}

export function billingReference(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function paidPriceId() {
  const id = process.env.PADDLE_PAID_PRICE_ID;
  return id &&
    id !== process.env.NEXT_PUBLIC_PADDLE_PRICE_ID &&
    /^pri_[a-z0-9]{26}$/.test(id)
    ? id
    : undefined;
}

export async function paddle<T>(
  path: string,
  body?: object,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch("https://sandbox-api.paddle.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + process.env.PADDLE_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Paddle returned " + response.status);
  return (await response.json()).data;
}

export type Transaction = {
  id: string;
  status: string;
  custom_data?: { leasedesk?: string };
  subscription_id?: string;
  items?: { price: { id: string }; quantity: number }[];
};

type Subscription = {
  status: string;
  items: { price: { id: string } }[];
  management_urls?: { cancel?: string; update_payment_method?: string };
};

export async function getMembership() {
  const jar = await cookies();
  const secret = jar.get(sessionCookie)?.value;
  const id = jar.get(transactionCookie)?.value;
  const inactive = {
    active: false,
    workspaceId: null,
    status: "inactive",
    transaction: null,
    management: undefined,
  };
  if (
    !secret ||
    !/^[a-f0-9]{64}$/.test(secret) ||
    !id ||
    !/^txn_[a-z0-9]{26}$/.test(id)
  )
    return inactive;

  const transaction = await paddle<Transaction>("/transactions/" + id);
  if (transaction.custom_data?.leasedesk !== billingReference(secret))
    return inactive;
  if (transaction.status !== "completed" || !transaction.subscription_id) {
    return { ...inactive, status: transaction.status, transaction };
  }
  const subscription = await paddle<Subscription>(
    "/subscriptions/" + transaction.subscription_id,
  );
  const matches = subscription.items.some(
    ({ price }) =>
      price.id === process.env.NEXT_PUBLIC_PADDLE_PRICE_ID ||
      price.id === paidPriceId(),
  );
  const active =
    matches && ["trialing", "active"].includes(subscription.status);
  return {
    active,
    workspaceId: active
      ? createHash("sha256")
          .update("leasedesk:" + transaction.subscription_id)
          .digest("hex")
      : null,
    status: subscription.status,
    management: matches ? subscription.management_urls : undefined,
    transaction,
  };
}
