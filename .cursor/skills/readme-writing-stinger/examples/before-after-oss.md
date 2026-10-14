# Before/After: OSS Library README

> Demonstrates: `guides/01-structure-checklist.md`, `guides/02-badges.md`, `guides/00-principles.md`

A worked before/after example showing how `readme-writing-worker-bee` audits and rewrites an OSS library README using the structure checklist and badge discipline.

---

## BEFORE (submitted by user)

```markdown
# mylib

This library was created to solve the problem of data validation in TypeScript projects.
We needed something lightweight and we couldn't find anything that fit our needs.

## About

mylib provides a set of utilities for runtime data validation. It is written in TypeScript
and supports both CJS and ESM. We plan to add more validators in the future.

## Installation

You can install mylib by running the following command in your terminal:

```
npm install mylib
```

Note: You will need Node.js version 18 or higher.

## How to Use

To use mylib in your project, first import it:

```typescript
import { validate } from 'mylib';
```

Then call validate with your data and schema.

## Notes

This is a work in progress. PRs are welcome.

MIT License.
```

---

## Audit table (Step 2 output)

| Section | Status | Notes |
|---|---|---|
| Title | ✅ pass | |
| One-liner tagline | ❌ fail | Missing; "About" section is a paragraph, not a one-liner |
| Badges | ❌ fail | No badges at all |
| Hero/demo |, | N/A for a library |
| Quickstart | ❌ fail | Install present but usage example is prose, not runnable |
| Features | ❌ fail | Missing |
| Install | ⚠️ warn | Node version mentioned but not as prerequisite header |
| Usage | ⚠️ warn | Shows import but no runnable example with input/output |
| Contributing | ⚠️ warn | "PRs welcome" is a vanity statement; no actual instructions |
| License | ⚠️ warn | "MIT License" with no link and no `LICENSE` file reference |

**Overall:** 0/5 core sections pass. Needs significant restructure.

---

## AFTER (readme-writing-worker-bee output)

```markdown
# mylib

> Lightweight runtime data validation for TypeScript. Zero dependencies, CJS + ESM.

[![CI](https://img.shields.io/github/actions/workflow/status/owner/mylib/ci.yml)](https://github.com/owner/mylib/actions)
[![npm version](https://img.shields.io/npm/v/mylib)](https://www.npmjs.com/package/mylib)
[![Coverage](https://img.shields.io/codecov/c/github/owner/mylib)](https://codecov.io/gh/owner/mylib)
[![License](https://img.shields.io/github/license/owner/mylib)](LICENSE)

## Quickstart

```bash
npm install mylib
```

```typescript
import { validate, string, number } from 'mylib';

const schema = { name: string(), age: number() };
const result = validate({ name: 'Alice', age: 30 }, schema);
// => { valid: true, data: { name: 'Alice', age: 30 } }

const bad = validate({ name: 'Bob', age: 'thirty' }, schema);
// => { valid: false, errors: [{ path: 'age', message: 'expected number' }] }
```

## Features

- Type-safe schema definitions with TypeScript generics
- Zero runtime dependencies
- Works in Node.js 18+, Deno, and browser environments
- CJS and ESM builds
- Composable validators: `string()`, `number()`, `boolean()`, `array()`, `object()`
- Descriptive error messages with field paths

## Install

**Prerequisites:** Node.js 18+

```bash
npm install mylib
# or
yarn add mylib
# or
pnpm add mylib
```

## Usage

### Basic validation

```typescript
import { validate, string, number, boolean } from 'mylib';

const userSchema = {
  name: string(),
  age: number(),
  active: boolean(),
};

const result = validate(input, userSchema);
if (!result.valid) {
  console.error(result.errors);
}
```

### Composing validators

```typescript
import { validate, object, array, string } from 'mylib';

const schema = object({ tags: array(string()) });
validate({ tags: ['a', 'b'] }, schema); // => { valid: true }
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm test` before submitting a PR.

## License

Licensed under the [MIT](LICENSE) License.
```

---

## What changed

| Change | Principle |
|---|---|
| Added one-liner tagline under title | Visitor converts in 30 seconds, tagline is the first signal |
| Added 4 badges (CI, version, coverage, license) | `guides/02-badges.md` approved types only |
| Moved Quickstart before Features and Install | Quickstart is the hero section |
| Replaced prose usage with runnable code + output | Every example must be copy-paste demonstrable |
| Added Features bullet list | Gives the scanner a reason to read further |
| Rewrote Contributing | Specific ("run `npm test`") vs vague ("PRs welcome") |
| Fixed License line | One-line with link to `LICENSE` file |
