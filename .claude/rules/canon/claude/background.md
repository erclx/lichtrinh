---
description: Run a command that may take more than about a minute in the background and resume on the harness wake
---

# Background standards

## Slow commands

- Start a command that may run past about a minute in the background, such as a full check, a sandbox run, a capture, a build, or a wait on another session.
- Keep a command that finishes in seconds in the foreground.
- End the turn on one line naming what runs, and act on the harness wake, never on a guess about when it is done.
- Keep working beside a server or a watch the session never waits on, since its wake never comes.
- Keep a skill's own wait as the skill states it.
