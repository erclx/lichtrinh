---
description: Route edits under .canon/tasks/ to the task-create skill, and keep a session handoff apart from a task
paths:
  - '.canon/tasks/**'
---

# Tasks standards

## Task files

- Load the `canon:task-create` skill before a hand edit under `.canon/tasks/`, for a task file, the board, and a declined task.
- Treat a `.canon/tasks/session-*.md` file as a `canon:session-map` handoff, not a task.
