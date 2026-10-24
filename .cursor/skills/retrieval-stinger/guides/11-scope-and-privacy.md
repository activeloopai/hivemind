# 11 - Scope and Privacy

Scope decides who sees a mined skill. It is set in `src/skillify/scope-config.ts` and enforced by propagation (`pull.ts` / `auto-pull.ts`). Getting it wrong leaks one person's session-derived knowledge to people who should not have it - a privacy finding.

---

## The two scopes

`scope-config.ts` defines:

```
type Scope = "me" | "team";
const DEFAULT: ScopeConfig = { scope: "me", team: [], install: "project" };
```

| Scope | Who mines from | Who receives |
|---|---|---|
| `me` | only the author's own sessions | only the author |
| `team` | the author + listed team members | the listed team |

Default is `me` with an empty team list - the conservative default. A skill is private to its author unless the user explicitly opts into `team`.

---

## The retired `org` value

`scope org` was a third value that was removed. `scope-config.ts` silently coerces a stored `"org"` to `"team"` on read so a user who ran `hivemind skillify scope org` once does not hit a hard failure on the next session. Treat any `"org"` you encounter as `"team"`; do not reintroduce a third scope.

---

## The privacy boundary

The load-bearing rule: **propagation must never fan a `me`-scoped skill to anyone but its author.**

- A `me` skill is derived from one person's raw sessions. Those sessions can contain anything the user typed - private context, half-formed ideas, sensitive references.
- Fanning it to teammates exposes that derived content. That is a privacy leak, and it is a must-fix.
- The pull path reads each `skills` row's author/scope before deciding what a given user receives. A pull that ignores scope and fans everything is the failure to hunt for.

Scope is a privacy boundary, but it is not a hardened security control on its own - the PII and access-control audit (is sensitive content ending up in a mined skill at all, even a `me` one) is security-worker-bee's. retrieval-worker-bee flags the scope-respect bug with file:line; the deeper audit is theirs.

---

## Scope promotion

`scope-promotion.ts` handles deliberately promoting a `me` skill to `team`. That is a user-initiated, recorded decision - the legitimate way a private skill becomes shared. It is the opposite of a silent leak: explicit, auditable, and reversible. A promotion should re-stamp the skill's scope metadata so propagation then treats it as `team`.

---

## What to check on a scope-privacy-review

1. **Does the pull read scope per row** before fanning, or does it fan blindly?
2. **`me` stays with the author** - the headline test.
3. **`org` coerced to `team`**, not crashed or treated as a live third scope.
4. **Promotion is explicit** - a `me` -> `team` move went through `scope-promotion.ts`, not a silent metadata edit.
5. **Hand PII / sensitive-content questions to security-worker-bee** - "should this content be in a skill at all" is their call.
