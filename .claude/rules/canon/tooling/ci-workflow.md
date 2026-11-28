---
description: Route workflow edits to the ci-workflow skill
paths:
  - '.github/workflows/**'
---

# CI workflow standards

## Authority

- Load the `canon:ci-workflow` skill before editing a workflow, for triggers, pinning, job shape, steps, token scopes, and commit-back.
- Never commit back to the trunk from a workflow. A commit with no pull request and no reviewer needs an operator's decision.
