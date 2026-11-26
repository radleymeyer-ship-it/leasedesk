# LeaseDesk

LeaseDesk tracks tenant and landlord contacts, commercial lease dates, rental escalations and arrears. It drafts renewal messages and South African notices of breach for review and copying.

## Run locally

Use Node.js 22 or later.

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. With Paddle unconfigured, the dashboard runs in demo mode. Lease records are stored in the current browser. Reset sample data replaces all records in that browser after confirmation.

Once Paddle verifies a trial or paid subscription, LeaseDesk opens an empty workspace for that subscription. New leases are kept separately from the demo in that browser, and the same workspace opens when the trial converts to paid Pro.

Use sample data on shared devices. Browser storage is readable by scripts served from the same origin and is shared by people using the same browser profile. Use authenticated, organization-scoped storage before onboarding customers.

## PDF import

Set `GEMINI_API_KEY` in `.env.local`. Optionally set `GEMINI_MODEL` to a PDF-capable Gemini model with structured output support. The default is `gemini-3.5-flash-lite`.

PDFs up to 4 MB are sent to Gemini for extraction. The import opens a review form. Blank rent and escalation values must be filled in before saving. Contact details and contract terms should be checked against the source document.

PDF extraction is available in local development and to active sandbox Pro subscriptions. In a production demo without sandbox billing, the server rejects PDF import requests. Use synthetic PDFs for sandbox testing.

## Paddle Pro

Create a LeaseDesk Pro product and an active recurring price for USD 20 every month with a 30-day free trial that collects a payment method. Set Paddle's default payment link to the LeaseDesk homepage on your approved domain. Use a Paddle sandbox account for testing. Grant the Paddle API key Price Read, Transaction Write, Subscription Read, and Customer Portal Session Write permissions.

Set these variables in `.env.local` or your deployment environment and rebuild after changing public variables.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_PADDLE_ENV` | `sandbox` |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle sandbox client-side token starting with `test_` |
| `NEXT_PUBLIC_PADDLE_PRICE_ID` | Paddle price ID for the Pro plan |
| `PADDLE_PAID_PRICE_ID` | Optional second Paddle price ID for USD 20 monthly without a trial. Enables **Upgrade to Pro** for customers who want to pay today. |
| `PADDLE_API_KEY` | Server-only Paddle sandbox API key |
| `APP_ORIGIN` | Public app origin such as `https://app.example.com`, without a trailing slash, if a proxy rewrites the request origin |

Use HTTPS for any hosted sandbox. The server checks Paddle before starting a checkout and when determining whether a sandbox subscription can import PDFs. Browser billing cookies support sandbox testing on the same browser and origin.

Trial subscriptions renew into Pro automatically unless cancelled. Use matching South Africa price overrides on both prices if you configure fixed rand billing.

Live checkout is disabled pending account-based billing. Before enabling it, link Paddle subscriptions to signed-in organization accounts, verify Paddle webhook signatures, and apply durable upload quotas. Use database authorization policies to isolate leases and contacts by organization. Keep `PADDLE_API_KEY` and `GEMINI_API_KEY` server-side. The Paddle client token and price ID are public configuration.

The renewal and default notice workflows create drafts you can copy. Check the lease's cure period and service requirements before sending a notice.

## Renewal tools

Open **Renewals & escalations** to compare renewal terms, track replies, or open the email queue. The **Weekly landlord report** is a copyable snapshot for one landlord at a time. It includes active leases expiring within 90 days, increases scheduled in the next 30 days, and open renewal rent at risk. The comparison uses base rent and shows a year-one difference against both current rent and the contractual escalation.

The renewal email queue uses the shared Supabase project, with each broker's sequences and recent delivery log scoped to their verified account. Lease records and broker notes are still browser-local. Keep that browser data until cloud lease storage is integrated. Signup, tenant email verification, and approval of real recipients are separate steps. Email automation is for renewal reminders. Letter drafts continue to require a broker to review and send them.

### Enable test email delivery

Apply the migration in `supabase/migrations` to the intended project. Configure these server environment variables on the host that runs LeaseDesk:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project URL and publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key for the queue runner |
| `AUTOMATION_CRON_SECRET` | Random secret of at least 32 characters |
| `RESEND_API_KEY` | Server-only sending key |
| `RENEWAL_EMAIL_FROM` | Address on a verified Resend domain |
| `RENEWAL_EMAIL_TEST_TO` | Your own address for all test deliveries |
| `RENEWAL_EMAIL_ALLOWED_USERS` | Comma-separated Supabase Auth user UUIDs allowed to dispatch |

Schedule an HTTPS POST to `/api/renewal-email/run` every minute with `Authorization: Bearer <AUTOMATION_CRON_SECRET>`. For Supabase Cron, store the endpoint and authorization secret in Vault, then use `pg_net` to post to the endpoint. Each invocation claims at most one email. A response showing `sent` means the email provider accepted the request. Pause stops future claims. A message already being handed to the provider may still be delivered.

Test using a lease and recipient you control. To enable real recipients, explicitly set `RENEWAL_EMAIL_LIVE=true` after cancelling test queues and checking the delivery log. The worker otherwise routes every email to the configured test address. No scheduler or sender is enabled by the migration alone.

## Checks

```powershell
npm run lint
npx tsc --noEmit
npm run build
```
