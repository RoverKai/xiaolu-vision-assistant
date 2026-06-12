---
name: pr-commit-guidelines
description: Project-level PR and commit workflow rules for xiaolu-vision-assistant. Use when preparing, reviewing, or refining pull request titles/descriptions, commit plans/messages, branch strategy, or change-splitting decisions so work follows the repository rule of one feature per PR and clear validation notes.
---

# PR and Commit Guidelines

## Overview

Apply this repository's PR and commit rules before creating commits, opening pull requests, or advising on branch flow. Keep changes small, explicit, and easy to validate.

## Core Rule

Make each PR do exactly one thing.

- Implement or modify a single feature, fix, or behavior per PR.
- Prefer the smallest practical PR.
- Split large features into multiple independent PRs that can be reviewed and tested step by step.
- If the current diff mixes unrelated work, recommend a split before drafting the PR or commit message.

## Branch Workflow

Use the repository's three-branch model:

- `main`: stable branch; receive changes by merging stable `develop`.
- `develop`: integration branch; collect feature work for testing.
- `feature/*`: active development branches; use one feature branch per feature.

When advising on branch selection, route feature work through `feature/*` into `develop`, then promote stable `develop` to `main`.

## PR Title and Description

Draft PR content with these required parts:

- Title: one sentence explaining what this PR adds or changes.
- Feature description: what the feature does and how to use it.
- Implementation approach: concise technical choices or core implementation logic.
- Testing method: exact steps, commands, or manual checks used to verify behavior.

Use this structure when the user asks for a PR description:

```markdown
## 功能描述
- ...

## 实现思路
- ...

## 测试方式
- ...
```

## Commit Guidance

Keep commits aligned with the PR's single purpose. The source project guidance does not define a required commit prefix format, so do not invent one unless the repository later adds it.

- Use short, imperative commit messages, for example `Add camera permission check`.
- Keep unrelated formatting, generated files, or refactors out of feature commits unless they are required for the change.
- Before committing, inspect the diff and mention the validation performed.

## Review Checklist

- Does the PR contain only one feature or behavior change?
- Is the title clear in one sentence?
- Does the description explain usage and implementation?
- Are test steps concrete enough for another contributor to repeat?
- Is the branch target consistent with `feature/*` -> `develop` -> `main`?
