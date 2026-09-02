# OMS Renewal - Simple Payment Link Setup

This build does NOT require Razorpay Key ID, Key Secret, Webhook Secret, Firebase Admin SDK, or Netlify Functions.

## Flow
1. Customer selects Quarterly / Semi Half-Yearly / Yearly.
2. Customer selects number of users.
3. OMS calculates the amount from Firebase plan pricing.
4. OMS opens the configured payment link.
5. OMS creates a renewal request in Firestore.
6. Customer sends the payment screenshot to WhatsApp 8750097457.
7. Super Admin verifies payment and clicks Activate in Subscription Control.
8. Expiry date and allowed users update automatically and OMS unlocks.

## Configure
Open `subscription-control.html` as super_admin and set:
- Expiry Date
- Warning Days (recommended 10)
- Allowed Users
- WhatsApp Number
- Global Payment Link: https://razorpay.me/@rankchahiyedm
- Quarterly / Semi Half-Yearly / Yearly prices
- Included Users and Extra User Price

You may optionally set a different payment link for an individual plan.


## Payment proof upload flow
After opening the payment link, the customer uploads a JPG/PNG/WEBP screenshot in the renewal modal. The browser compresses the screenshot before saving it with the Firestore renewal request. The Super Admin can preview the proof in Subscription Control and click Verify & Activate.
