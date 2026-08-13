---
name: review-staged
description: Review staged implementation against the active plan before git commit.
disable-model-invocation: true
---

# Pre-Commit Code Review

This is a mandatory delivery gate.

## 1. Resolve context

Locate:

- active `.plan`
- work_item_id
- objective
- requirements
- acceptance criteria
- architecture rules

Fail if no active plan can be identified.

## 2. Freeze review scope

Run:

git status --short
git diff --cached --name-only
git diff --cached
git write-tree

Do not review unstaged changes.

## 3. Verify implementation

Run project-required:

- lint
- typecheck
- unit tests
- relevant integration tests

## 4. Independent review

Delegate review to the `code-reviewer` subagent.

The reviewer must be read-only.

Provide:

- active plan
- requirements
- acceptance criteria
- staged diff
- test results

## 5. Produce review result

Write:

.cursor/review/current.json

Required fields:

- work_item_id
- plan
- review_model
- reviewed_tree
- verdict
- findings
- test_results
- reviewed_at

## 6. Gate

PASS:
allow commit.

BLOCK:
do not commit.
Return findings to implementation agent.