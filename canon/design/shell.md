---
title: Shell
description: The frame around every screen, being the desktop nav and docked chat, the tablet rail and Talk bar, and the phone tabs, with the admin's nav and the hidden nav
---

# Shell

Row v02.1 builds the shell. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `web/shell/app-shell.tsx`: the frame, its breakpoints, the gutters, and the `main` landmark
- `web/shell/nav.tsx`: the desktop sidebar, the admin's nav, and its hide toggle, the tablet rail, and the phone tabs
- `web/shell/top-bar.tsx`: the wordmark, the language toggle, and the Settings button
- `web/shell/destinations.ts` and `web/shell/icons.tsx`: the places the nav links to and their drawn icons
- `web/shell/page-header.tsx`: the back control and the page heading every page renders
- `web/features/chat/chat-dock.tsx`: the docked chat column from 1024 wide and the half sheet from 480 to 1023
- `web/features/chat/talk-bar.tsx`: the Talk bar above the phone tabs and at the foot of the tablet page, drawn without the mic
- Not built yet: the hide-menu icon on the hidden nav, which v05.4 builds

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide
- The plain page, the open chat, and the admin's nav
- The hidden nav, at 1440 alone
- Light and dark
