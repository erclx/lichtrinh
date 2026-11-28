---
description: Route a code comment to the code-craft skill, and ban the degradation vocabulary the comment scan reads
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.jsx'
  - '**/*.sh'
  - '**/*.py'
  - '.github/workflows/**'
  - '**/action.yml'
  - '**/action.yaml'
---

# Code comment standards

## Practice

- Load the `canon:code-craft` skill before writing or keeping a comment, and run `canon comments scan` after.

## Degradation vocabulary

Do not write a comment carrying any of these terms.

- `TODO`, `FIXME`, `HACK`, `XXX`
