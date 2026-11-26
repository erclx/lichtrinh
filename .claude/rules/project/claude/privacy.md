---
description: Keep real people, trips, recordings, and secrets out of everything this public repository publishes
---

# Privacy standards

## People

- Name people by role, such as a parent, the traveler, the family, or the admin. Never write a real person's name or nickname, in code, docs, commits, or issues.

## Trip data

- Invent every seed and test trip, since a real date, place, or flight detail tells a stranger when a home stands empty.
- Never commit a contact detail or a credential. Keep secrets in `.dev.vars` or Wrangler secrets.
- Keep voice recordings and chat transcripts outside the repository, benchmark clips included.
- Capture screenshots and evidence from invented seed data alone, never from a real account or production.

## Chat text

- Show production's saved chat text on the owner panel alone, read through the owner route with its own secret.
- Never log, cache, or write that text to disk on either side, and never show a raw voice transcript, since nothing saves one.

## Logs

- Log ids and outcomes in production, never the text of a chat message, a transcript, or an event.
