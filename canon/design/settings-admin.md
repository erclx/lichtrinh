---
title: Settings and admin
description: The settings page, the assistant and voice settings, and the admin's accounts page
---

# Settings and admin

Rows v02.1 and v01.6 build these screens. These frames are a reference, and where a row's plan differs from a frame, the plan wins.

## Code

- `web/features/settings/settings-page.tsx`: settings, holding Language, Add to home screen, Manage accounts, and Sign out
- `web/features/accounts/accounts-page.tsx`: the accounts list, with the reset confirm in `reset-confirm.tsx`
- `web/features/accounts/backup-download.tsx`: the backup section under the accounts list
- `web/features/accounts/create-account-page.tsx`: creating an account
- `web/features/accounts/edit-account-page.tsx`: editing an account
- `web/features/rates/rates-page.tsx`: the exchange rates page
- `web/features/accounts/password-once.tsx`: the password shown once after a create or a reset
- `web/features/assistant-settings/assistant-settings-page.tsx`: the admin's assistant page, holding the home computer card, both model choices, and the offline contact name, with its calls in `assistant-settings-api.ts`
- `web/features/assistant-settings/notify-me.tsx`: Notify me by on that page, being Push for this device and Email, with the device in `push-device.ts`
- `web/public/push-handler.js` and `shared/notice-text.ts`: the push and the email the `notify-received` frames show
- The permission question in the `notify-asking` frames imitates the device's own, which the app never draws

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Settings, and settings for the family
- The assistant and voice settings with both ways to notify on
- Notify me by with nothing chosen, push on, asking, blocked, and not on the home screen, and an email invalid or unconfirmed
- What the admin receives, as a push and an email
- The accounts page, its backup, creating an account and its confirmation, a password reset, and editing an account
- The exchange rates
