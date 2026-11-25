---
title: Owner panel
description: The owner's local panel on the workspace PC, showing whether voice, the local model, and the bridge are up, with the controls that start and stop them
---

# Owner panel

Row v03.0 builds this page, and the owner alone reads it, in English. Activity and Messages are drawn ahead of the plan that builds them.

## Code

- `panel/ui/panel-page.tsx`: the page, with a failed service in a row of its own above the rest
- `panel/ui/verdict.tsx`: the heading, its line, and its buttons
- `panel/ui/service-tile.tsx`: one service, with its status, detail, buttons, and log lines
- `panel/ui/stop-all-dialog.tsx`: the confirm in front of Stop all, naming the staging bridge when it runs
- `panel/ui/gpu-card.tsx`: the graphics card's bar and its legend
- `panel/ui/copy.ts`: every line the verdict and the tiles say

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Voice failed in a row of its own with its log open, and everything up
- The Stop all confirm, with the staging bridge running
