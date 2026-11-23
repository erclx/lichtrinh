---
title: Chat
description: The list of conversations and one thread with the assistant
---

# Chat

Row v01.5 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `src/features/chat/chat-list-page.tsx`: the saved chats, most recent first, with New chat and the empty state
- `src/features/chat/thread-page.tsx`: one chat as a page, with Back to the list
- `src/features/chat/thread.tsx`: the messages, the live reply, and the composer, shared by the page, the dock, and the sheet
- `src/features/chat/composer.tsx`: the message box with Send, and Stop while a turn runs, leaving room for the mic
- `src/features/chat/change-card.tsx`: one change a reply made, tinted by the entry's kind, with Undo and Undone
- `src/features/chat/step-line.tsx`: one step the assistant took, in plain words
- `src/features/chat/notice-card.tsx`: the offline card naming whom to contact, and the failed card with Try again, on the muted fill

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- The list and a thread
- The assistant thinking, and working on a change
- A failed request
- The assistant offline, before and after the family is told
