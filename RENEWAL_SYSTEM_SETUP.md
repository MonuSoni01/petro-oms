# OMS Renewal / Subscription System

Version: 2026-09-02.1

## What is included

- Firebase-driven subscription expiry date.
- Global warning bar on protected OMS pages when expiry is within the configured warning period (default 10 days).
- Non-closable work lock on the expiry date and after expiry.
- Renewal plan selection.
- User-count based price calculation.
- Firebase-configured global payment link and optional plan-specific payment links.
- Renewal request logging in Firestore.
- WhatsApp payment screenshot verification flow to `8750097457` by default.
- Super Admin vendor page to manage the subscription and activate verified renewal requests.
- Service worker cache version bumped so the new renewal code is fetched after deployment.

## Important first-time setup

The app prefers this Firestore document:

`subscription/current`

If it does not exist, it automatically falls back to the old document already referenced by this OMS:

`subscription/TZxEjESFJ6xuT9V3ZGfM`

It can also fall back to the first document in the `subscription` collection.

### Recommended subscription document fields

```text
enabled: true
status: "active"
companyName: "PETRO OMS"
expiryDate: "2026-12-31"
warningDays: 10
allowedUsers: 5
whatsappNumber: "8750097457"
paymentLink: "https://YOUR-PAYMENT-LINK"
currency: "INR"
plans: [ ... ]
```

`renewalDate` is also supported for backward compatibility. The vendor control page writes both `expiryDate` and `renewalDate`.

## Configure everything without manually editing Firestore

Login with a `super_admin` account, then open:

`/subscription-control.html`

On the Admin Dashboard, a **Subscription Control** menu is also shown only when the current local role is `super_admin`.

From this page you can set:

- Company / Software name
- Status
- Expiry date
- Warning days
- Current allowed users
- WhatsApp verification number
- Global payment link
- Quarterly / Semi Half-Yearly / Yearly plan pricing
- Included users
- Extra user price
- Optional plan-specific payment link

### Pricing formula

```text
Total = Base Price + (Extra Users × Extra User Price)
Extra Users = max(0, Requested Users - Included Users)
```

No renewal prices were supplied when this ZIP was prepared, so the default plan prices are intentionally `0`. Configure the real prices from Subscription Control before customer use.

## Customer renewal flow

1. More than warning days remaining -> OMS works normally.
2. 10 days (or configured warning days) remaining -> top warning bar appears on protected pages.
3. User can click **Renew Now** before expiry.
4. On expiry date -> OMS work area is locked.
5. User clicks **Renew Subscription**.
6. User selects a plan.
7. User selects required number of users.
8. Amount is calculated from Firebase pricing.
9. User clicks **Proceed to Payment**.
10. A `renewal_requests` Firestore document is created.
11. Configured payment link opens.
12. After payment, user clicks **Payment Done — Send Screenshot on WhatsApp**.
13. WhatsApp opens with a pre-filled message containing:
    - Renewal reference ID
    - Company
    - Plan
    - Required users
    - Amount
    - Previous expiry
14. User manually attaches the payment screenshot and sends it to `8750097457` (or the Firebase-configured number).
15. Vendor verifies the screenshot.
16. Vendor opens `/subscription-control.html`, finds the request and clicks **Activate**.
17. The subscription expiry is extended by the selected plan duration.
18. `allowedUsers` is updated to the requested user count.
19. Request status becomes `activated`.
20. Because the customer pages use a realtime Firestore listener, the OMS automatically unlocks when the updated subscription reaches the browser.

## Firestore renewal request fields

Collection: `renewal_requests`

Typical fields:

```text
subscriptionDocId
companyName
planId
planName
durationMonths
requestedUsers
amount
currency
paymentLink
currentExpiryDate
status
requester
sourcePage
createdAt
clientCreatedAt
appVersion
```

Statuses used by the UI:

- `payment_pending`
- `verification_sent`
- `activated`

## Pages protected by the global renewal manager

- `index.html`
- `index1.html`
- `admin-dashboard.html`
- `admin-profile.html`
- `activity.html`
- `automation.html`
- `sales-dashboard.html`
- `dashboard/sales.html`
- `orders/orders.html`
- `orders/edit-order.html`
- `users/users.html`
- `e-commerce/index1.html`
- `e-commerce/cart.html`

Login pages are intentionally not locked so a user can still log in and reach the renewal experience.

## Key file

`/js/subscription-manager.js`

This one common file controls the warning, expiry lock, renewal UI, plan calculation, payment-link opening and WhatsApp verification flow. Do not copy separate renewal logic into every page.

## Security note

The global modal/lock prevents normal UI usage and is suitable for the requested browser workflow. Any purely front-end JavaScript lock can be bypassed by a technically skilled user with browser developer tools.

For security-grade SaaS licensing, Firestore Security Rules or a trusted backend should additionally deny protected reads/writes when the subscription is expired. This ZIP does not overwrite your existing Firestore rules because the current deployed rules were not included in the provided ZIP and replacing them blindly could break the live OMS.

Also, do not give customer companies the `super_admin` role. Keep `super_admin` only for the software vendor/owner, because it can access the Subscription Control page.

---
## Automatic payment provider Payment Build (v2)
For the new exact-amount automatic payment provider flow, follow `RAZORPAY_AUTOMATION_SETUP.md`.
This replaces screenshot-based manual activation when payment provider API credentials and webhook are configured.
