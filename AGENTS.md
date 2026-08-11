# Repository Guidelines

## Project Structure & Module Organization

Core TypeScript lives in `src/`. CLI code is under `src/cli/` and `src/commands/`; shared hooks are in `src/hooks/shared/`, with runtime integrations in `src/hooks/{claude-code,codex,cursor,hermes,pi}/`. Graph, embedding, notification, and skill-generation code has matching subdirectories. Keep runtime packaging in `harnesses/`, documentation in `docs/`, utilities in `scripts/`, and QA records in `library/`.

Tests live in `tests/` and are grouped by runtime (`tests/codex/`, `tests/openclaw/`, etc.). Put agent-independent coverage in `tests/shared/`; do not add new shared tests to the legacy `tests/claude-code/` location. Build output (`dist/`, `bundle/`, and harness bundles) is generated and should not be edited by hand.

## Build, Test, and Development Commands

- `npm install` installs dependencies; Node.js 22 or newer is required.
- `npm run build` type-checks, synchronizes versions, and builds all CLI and runtime bundles.
- `npm run dev` runs TypeScript in watch mode.
- `npm test` runs the full Vitest suite once. Target a file with `npx vitest run tests/shared/atomic-write.test.ts`.
- `npm run typecheck` checks types without emitting files.
- `npm run ci` runs type checks, duplication detection, and tests.
- `npm run pack:check` validates the package contents before publishing.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, double quotes, and semicolons. Include `.js` extensions in relative imports for compiled Node ESM. Use `camelCase` for functions and variables, `PascalCase` for types and interfaces, and kebab-case filenames such as `session-start.ts`. Prefer shared helpers over copying logic between integrations. There is no standalone formatter; match nearby code. The pre-commit hook type-checks staged TypeScript.

## Testing Guidelines

Use Vitest with `*.test.ts` names and mirror the relevant runtime or subsystem. Cover success, failure, and platform-specific branches; inject filesystem, timing, or process seams instead of relying on live services. Run `npx vitest run --coverage` when changing covered modules. New source files should be added to the per-file thresholds in `vitest.config.ts`, normally at 80% for statements, branches, functions, and lines.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style: `fix(windows): ...`, `feat(graph): ...`, `test(summary): ...`, or `docs: ...`. Keep commits focused and imperative. PRs must include a clear summary and test plan, add relevant tests, and confirm `npm test`. Link issues and include screenshots for dashboard or documentation UI changes. Bump `package.json` using semantic versioning only when the PR should trigger a release; otherwise explicitly mark that no release is needed.
