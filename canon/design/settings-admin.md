---
title: Settings and admin
description: The settings page, the assistant and voice settings, and the admin's accounts page
---

# Settings and admin

Rows v02.1 and v01.6 build these screens. These frames are a reference, and where a row's plan differs from a frame, the plan wins.

## Code

- `web/features/settings/settings-page.tsx`: settings, holding Language, Manage accounts, and Sign out
- `web/features/accounts/accounts-page.tsx`: the accounts list, with the reset confirm in `reset-confirm.tsx`
- `web/features/accounts/create-account-page.tsx`: creating an account
- `web/features/accounts/edit-account-page.tsx`: editing an account, with no frame of its own, built from the create frame's fields
- `web/features/accounts/password-once.tsx`: the password shown once after a create or a reset
- `web/features/assistant-settings/assistant-settings-page.tsx`: the admin's assistant page, holding the home computer card, both model choices, and the offline contact name, with its calls in `assistant-settings-api.ts`
- The page lists the two local aliases in place of the frame's Claude rows
- The speech recognition section adds a usage line under each model, which the frame does not draw

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Settings, and the assistant and voice settings
- The accounts page, creating an account and its confirmation, and a password reset
- No frame draws the edit page, so its states live in the code and the evidence captures
