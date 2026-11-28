---
description: Enter a linked worktree for implementation, and resolve shared session scratch at the main root
---

# Worktrees standards

## Entering a worktree

- From the main worktree, enter a linked one with `/session-worktree` before editing tracked files for a feature.

## Shared session scratch

- Resolve `.canon/plans/`, `.canon/review/`, and `.canon/tasks/` at the main worktree root, never inside a linked worktree, and route a main-root write the way the `session-worktree` skill states.
