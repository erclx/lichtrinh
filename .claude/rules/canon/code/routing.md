---
description: Routes code placement, shape, and interface decisions to the skills that carry them, and library calls to the official docs
---

# Code standards

## Placement

- Load the `canon:codebase-layout` skill before placing a new file.

## Shape

- Load the `canon:code-craft` skill before deciding the shape of a new function, class, or module.

## Interfaces

- Load `canon:api-design` before shaping a public function, flag or output, record format, endpoint, or caller-handled error.

## Libraries

- Before calling a library API the codebase does not already use, fetch the official docs for the installed version and match the call to them, since recall of an API goes stale.
