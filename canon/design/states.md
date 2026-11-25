---
title: States
description: The whole-app error screen and the offline screen
---

# States

The first row to build each screen builds its error and offline states. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `web/offline/offline-card.tsx`: the card over every page with no connection
- `web/features/chat/talk-bar.tsx`: the dimmed Talk bar
- `web/features/chat/thread.tsx`, `web/features/chat/composer.tsx`, and `web/features/chat/change-card.tsx`: the chat with no connection, with no offline card and Undo waiting

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- An error, offline with the last loaded plan, and offline in a chat
