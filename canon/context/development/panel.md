---
title: Owner panel
description: The workspace PC's systemd units, the desktop shortcut, the status server, and the page that starts and watches them
---

# Owner panel

## Overview

Owns how voice and the bridge start on the workspace PC and the local page that shows whether they run. The bridge and the voice server are the setup entry's, at `canon/context/development/setup.md`, and the panel only starts, stops, and reads them.

The owner runs it by hand and alone, so its copy is English and outside the translation files. Nothing here reaches the app or a deployed copy.

## Layout

### `cli/panel/`

Holds what `lichtrinh panel` writes and runs on the machine. The owner installs once from the main checkout, after `bun link`, and again after Bun, uv, or Node moves.

| Command                   | Purpose                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `lichtrinh panel install` | Write five units under `~/.config/systemd/user/` and the desktop shortcut         |
| `lichtrinh panel open`    | What the shortcut runs, starting the panel and the target and showing one window  |
| `lichtrinh panel down`    | Stop all five units, which ends the hold that keeps the distribution up           |
| `bun run panel:build`     | Build the page into `panel/dist`, which the panel unit also runs before it starts |

The units and the verbs hold to these:

- `lichtrinh.target` holds voice and the bridge. The staging bridge and the panel sit outside it, and no unit carries an install section, so nothing starts at sign-in.
- A bridge unit sources its settings file through `bash`, since systemd ignores the `export` lines there. Staging reads `bridge-staging.env` and the family's copy reads `bridge.env`.
- `install` refuses a linked worktree, a missing tool, and one host in both settings files, where the relay would replace each bridge with the other without end
- `open` keeps a session of its own until the panel unit stops, since WSL stops a distribution no session holds. A later `open` finds its lock held, starts nothing, and shows the window.

### `panel/server/`

The Bun process the panel unit runs on `127.0.0.1:4180`. It refuses a foreign `Host` on every route and any write the page itself did not send.

- `adapters/` holds one outside tool per file, so a changed output format opens one file
- A bridge reads as connected on its last `ready` in the running invocation, and as dropped 30 seconds after it lost the app, so an earlier run's `ready` never counts
- A start clears systemd's crash limit first, since a unit past three starts in five minutes refuses one
- Log lines drop the panel's own health reads and systemd's repeats. Ollama's pass an allow list, since a debug level there logs prompts.
- Load answers before the model is on the card, and Stop all or Unload drops a load still running

### `panel/ui/`

The page, built by its own Vite config and drawn on the app's kit and stylesheet. It reads the state every 3 seconds while visible and after each press, and the server reads the card at most every 10.

- A failed service takes a row of its own with its log lines open, and staging never changes the verdict
- `index.css` names the kit's folder as a class source, since a build rooted here scans nothing else

### `e2e/panel/`

The journey over a workspace PC in memory, which the `panel` project runs on port 4280 plus the worktree offset. CI names the `chromium` project alone, so there the `panel` project runs as its dependency.

- `bun e2e/panel/fake-server.ts` serves the page on invented states, and `curl -X POST <address>/fake/enter/<state>` enters one
- `bun e2e/panel/capture.ts` writes the evidence frames from that server at `SCREENSHOT_BASE_URL`

### Other folders

One folder serves the tests alone.

- `panel/server/test/` owns the fake machine the server tests and the e2e server share

## Gotchas

- Stop the bridge unit before a hand-run `lichtrinh bridge run`, since two bridges on one host replace each other without end
- `lichtrinh voice serve` and `bun run dev:full` hold port 8770 too, so the voice unit fails beside either and its tile says something else serves voice
- Stopping the staging bridge unloads the model it last used, so the family's next message waits for a reload
- Keeping the distribution up is unproven with every session closed. Set `instanceIdleTimeout=-1` in `.wslconfig` where it idles down.
- A change to `BRIDGE_PROTOCOL` fails one bridge tile between the merge and the release, since both units run one checkout
