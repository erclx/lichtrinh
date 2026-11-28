---
description: Route a comment in a dotfile, config, or workflow file to the code-craft skill
paths:
  - '**/.env*'
  - '**/.gitignore'
  - '**/.dockerignore'
  - '**/.editorconfig'
  - '**/Dockerfile*'
  - '**/*.config.*'
  - '**/*.json'
  - '**/*.yml'
  - '**/*.yaml'
  - '**/*.toml'
  - '**/*.jsonc'
---

# Config comment standards

## Comments

- Load the `canon:code-craft` skill before writing a config comment. Its comments reference covers a `#` block, and `canon comments scan` gates the three-line limit.
