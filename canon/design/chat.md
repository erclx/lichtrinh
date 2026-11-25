---
title: Chat
description: The list of conversations and one thread with the assistant
---

# Chat

Row v01.5 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `web/features/chat/chat-list-page.tsx`: the saved chats, most recent first, with New chat and the empty state
- `web/features/chat/thread-page.tsx`: one chat as a page, with Back to the list
- `web/features/chat/thread.tsx`: the messages, the live reply, and the composer, shared by the page, the dock, and the sheet
- `web/features/chat/composer.tsx`: the message box with Send, and Stop while a turn runs, with the mic `canon/design/talk.md` covers
- `web/features/chat/change-card.tsx`: one change a reply made, tinted by the entry's kind, with Undo and Undone
- `web/features/chat/step-line.tsx`: one step the assistant took, in plain words
- `web/features/chat/notice-card.tsx`: the offline card, and the failed card with Try again, on the muted fill
- `web/features/chat/notify-action.tsx`: what either offline card ends on, being Notify the admin, its sending, sent, and failed states, or whom to ask
- The strip atop each offline frame names the state for the board and is never built

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- The list and a thread
- The assistant thinking, and working on a change
- A failed request
- The assistant offline, ready to notify, sending, sent, failed, and already told by someone else
- The assistant offline with no way to notify set, and on the admin's own account
