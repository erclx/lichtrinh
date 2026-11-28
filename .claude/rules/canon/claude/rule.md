---
description: Route a project convention to a project rule rather than CLAUDE.md, and edits to a rule file to the write-rule skill
paths:
  - 'CLAUDE.md'
  - '.claude/rules/project/**/*.md'
---

# Rule standards

## Rule files

- Add a new project convention as a project rule through `canon:write-rule` rather than a new `CLAUDE.md` section, unless `CLAUDE.md` names another owner for it.
- Load the `canon:write-rule` skill before a hand edit to a rule.
