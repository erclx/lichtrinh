---
title: Chat
description: The traveler's chats with the assistant in the browser app, from the streamed turn to the dock, the sheet, and the Talk bar
---

# Chat

## Overview

Owns the browser half of talking to the assistant, for an account whose `canChat` is on. The API, the relay, and the bridge on the workspace PC are the subject of `canon/context/web/api.md`, and the frame the dock sits in is `canon/context/web/app.md`.

## Layout

### `web/features/chat/`

Holds the chat list, one thread with its composer, and the places each width draws a thread, all reading the chat routes through the `shared/chats.ts` schemas.

- `stream.ts` reads a send's NDJSON body line by line, skipping a line it cannot read, since throwing would cancel the stream and the API reads a cancel as Stop
- `turn.ts` folds stream events into thinking, working, replying, and the ends, and lays a turn over the saved messages until a refresh saves its part
- `use-turn.ts` refreshes the calendar keys on each `change` and the chat keys at the end, and never aborts on leaving the page, so a turn finishes unseen
- `change-card.tsx` undoes through the calendar's undo with one `undoId` per card, so a press retried after a lost answer reaches the stored undo
- The shell renders `chat-dock.tsx` from 1024 wide, as a half sheet from 480, and `talk-bar.tsx` otherwise, standing both aside on the chat pages

### `web/features/chat/voice/`

Holds the mic in the composer, from a tap to the words landing in the box for the traveler to fix before Send.

- `talk.ts` is the reducer over ready, starting, listening, transcribing, review, retry, denied, off, and failed, and only the middle three take the message row
- `use-talk.ts` warms voice on a tap, opens one session per tap so a late answer from a dropped one changes nothing, and sends the whole clip once on Stop
- `recorder.ts` records webm with Opus or else an older Safari's mp4 at 32 kbps, and closes the microphone on Stop, at 60 seconds, and when the page hides
- `live.ts` sends the clip piece by piece while it records, around `apiFetch` so a lost piece changes nothing else, and `live-words.tsx` lays the answers over the thread
- `edit-ratio.ts` measures the share of words changed between the box right after the words landed and the text sent, which rides the send as `voice`

## Gotchas

- A Stop or a drop carries no saved reply, so the thread asks again every second until the reply saves, then drops back to 30 seconds
- The e2e server reads `BRIDGE_SECRET` from its environment, and a `.dev.vars` holding one overrides it, so `e2e/chat.spec.ts` fails from such a checkout
- The relay holds one bridge per server, so every journey using the fake bridge stays in `e2e/chat.spec.ts` on Chromium alone, since a second file or engine would run beside it
