---
title: Talk
description: Speaking a request and checking the transcript before it is sent
---

# Talk

Row v01.6 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `web/features/chat/composer.tsx`: the message row with the mic between the box and Send, the hint and samples over an empty thread, and the review line once the words land
- `web/features/chat/voice/mic-button.tsx`: the mic, drawn off with its reason while voice or the home computer is off
- `web/features/chat/voice/listening-bar.tsx`: the row while the mic holds it, being the starting line, the level bar with Stop, and the writing-down line
- `web/features/chat/voice/live-words.tsx`: the large words over the thread while the traveler speaks, laid by `web/features/chat/thread.tsx` and asked for by `live.ts`
- `web/features/chat/voice/voice-notice.tsx`: the voice-off card naming whom to ask, with no Notify the admin yet, and the card for a refused microphone
- `web/features/chat/voice/use-talk.ts`: the recording and the transcription behind every state, over `talk.ts`, `recorder.ts`, and `level.ts`
- The hint, the samples, and the notices sit above the message row rather than at the top of the thread, so they stay beside the mic in a long thread

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Ready, listening, listening with live words, and transcribing
- Reviewing the transcript, and retrying
- Voice turned off
