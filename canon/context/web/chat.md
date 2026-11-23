---
title: Chat
description: The traveler's chats with the assistant in the browser app, from the streamed turn to the dock, the sheet, and the Talk bar
---

# Chat

## Overview

Owns the browser half of talking to the assistant, for an account whose `canChat` is on. The API, the relay, and the bridge on the workspace PC are the subject of `canon/context/web/api.md`, and the frame the dock sits in is `canon/context/web/app.md`.

## Layout

### `src/features/chat/`

Holds the chat list, one thread with its composer, and the places each width draws a thread, all reading the chat routes through the `shared/chats.ts` schemas.

- `stream.ts` reads a send's NDJSON body line by line, skipping a line it cannot read, since throwing would cancel the stream and the API reads a cancel as Stop
- `turn.ts` folds stream events into thinking, working, replying, and the ends, and lays a turn over the saved messages until a refresh saves its part
- `use-turn.ts` refreshes the calendar keys on each `change` and the chat keys at the end, and never aborts on leaving the page, so a turn finishes unseen
- `change-card.tsx` undoes through the calendar's undo with one `undoId` per card, so a press retried after a lost answer reaches the stored undo
- The shell renders `chat-dock.tsx` from 1024 wide, as a half sheet from 480, and `talk-bar.tsx` otherwise, standing both aside on the chat pages

## Gotchas

- A Stop or a drop carries no saved reply, so the thread asks again every second until the reply saves, then drops back to 30 seconds
- The e2e server reads `BRIDGE_SECRET` from its environment, and a `.dev.vars` holding one overrides it, so `e2e/chat.spec.ts` fails from such a checkout
- The relay holds one bridge per server, so the chat journey runs in Chromium alone, since two engines' fake bridges would replace each other
