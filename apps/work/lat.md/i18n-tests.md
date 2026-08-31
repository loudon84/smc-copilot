---
lat:
  require-code-mention: true
---

# i18n tests

Coverage for English-source-only locale authoring: co-change rejection and fallback when a non-source locale omits a key.

## Rejects English and non-English locale packages in the same change

A mixed add/modify of `locales/en` and `locales/<other>` is a simultaneous-creation violation and must fail the classifier.

## Allows English-only locale package changes

Feature diffs that only touch `locales/en` are valid and must not fail the guard.

## Allows translation-only non-English locale changes

Administrator translation diffs that only touch non-English locale packages are valid after English review.

## Working tree must not mix source and non-source locale packages

The live git gate collects add/modify paths and fails if English and another locale package both appear.

## Missing non-source keys fall back to English

When `zh-CN` (or any non-source locale) omits a key that exists in English, [[src/shared/i18n/index.ts#t]] returns the English string.
