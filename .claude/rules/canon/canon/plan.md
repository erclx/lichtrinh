---
description: Route edits under .canon/plans/ to the plan-change skill
paths:
  - '.canon/plans/**'
---

# Plan standards

## Plan files

- Load the `canon:plan-change` skill before a hand edit under `.canon/plans/`. Its references own the plan's shape, answer slots, sources, and lifecycle.
- Never fill an `- Answer:` slot on behalf of the person who owns it.
