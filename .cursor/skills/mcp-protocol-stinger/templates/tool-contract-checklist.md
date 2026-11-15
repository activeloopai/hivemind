# MCP Tool Contract Checklist

Use this checklist to evaluate whether a Hivemind MCP tool is well-formed and contract-stable.

---

## Naming and shape

| Check | Pass/Fail |
|---|---|
| Name is prefixed and snake_case (`hivemind_<verb>`) | |
| Name is stable and unique across the harness's server set | |
| `inputSchema` is a raw zod shape object, not `z.object(...)` | |
| Zod import is `zod/v3` (NOT `zod` / v4) | |
| Handler returns the MCP content shape `{ content: [{ type, text }] }` | |

---

## Schema

| Check | Pass/Fail |
|---|---|
| Every field has `.describe(...)` | |
| Bounds (`min`/`max`, `.int()`, enums) encoded in the type | |
| Required vs optional is correct (no stray `.optional()` on mandatory fields) | |
| Defaults applied in the handler, not duplicated into the schema | |
| User input that reaches SQL is escaped (`sqlStr`/`sqlLike`) | |

---

## Description (the model's only routing signal)

| Check | Pass/Fail |
|---|---|
| Says WHEN to use the tool, not just what it is | |
| States the return shape | |
| States correctness caveats (e.g. per-user isolation) | |
| Read-only vs side-effecting is stated or annotated | |

---

## Error model

| Check | Pass/Fail |
|---|---|
| Param-validation failures go through the SDK as `-32602` (not re-dressed as success) | |
| Domain outcomes (empty, unauth, backend down) returned as tool results | |
| Failure results marked (`isError` or unmistakable message) | |
| Raw backend errors classified into actionable messages, never leaked verbatim | |
| Non-Error rejections coerced (`String(err)`) | |
| Auth/credential failure short-circuits before any backend call | |

---

## Contract stability (multi-harness)

| Check | Pass/Fail |
|---|---|
| Name + arg shape match across MCP server, pi extension, Hermes doc, OpenClaw | |
| Description agrees across surfaces | |
| Any rename/removal/required-param change flagged as BREAKING | |
| Parseable output shape unchanged (or propagated everywhere) | |

---

## Tests

| Check | Pass/Fail |
|---|---|
| Registration-shape test pins the exact tool set + names | |
| Unauth, empty, happy, and failure branches covered | |
| Non-Error rejection path exercised | |
| Output-format and input-guard invariants asserted | |
