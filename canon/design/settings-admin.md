---
title: Settings and admin
description: The settings page, the assistant and voice settings, and the admin's accounts page
---

# Settings and admin

Rows v02.1 and v01.6 build these screens. These frames are a reference, and where a row's plan differs from a frame, the plan wins.

## Code

- `src/features/settings/settings-page.tsx`: settings, holding Language, Manage accounts, and Sign out
- `src/features/accounts/accounts-page.tsx`: the accounts list, with the reset confirm in `reset-confirm.tsx`
- `src/features/accounts/create-account-page.tsx`: creating an account
- `src/features/accounts/password-once.tsx`: the password shown once after a create or a reset
- The v01.6 plan names the paths for the assistant and voice settings

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Settings, and the assistant and voice settings
- The accounts page, creating an account and its confirmation, and a password reset
