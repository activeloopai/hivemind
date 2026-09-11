# library/knowledge-base/

Durable reference documentation for this repository. The things an engineer reads to understand the system. Not the place for requirements-in-flight - those live in `library/requirements/`.

## Categories

Create subfolders as needed. Recommended starters:

| Folder | Purpose | Audience |
|---|---|---|
| `architecture/` | System design, data flows, component relationships | Senior engineers, architects |
| `api/` | Endpoint-by-endpoint docs with request/response schemas | Frontend devs, API consumers |
| `how-to-guides/` | Runbooks: setup, test, deploy, debug | New engineers, DevOps |
| `integrations/` | Third-party service wiring (auth, errors, retry) | DevOps, integrators |
| `design/` | Visual language: tokens, components, patterns | Designers, frontend devs |
| `features/` | Completed feature reference (post-ship) | Any engineer joining the project |
| `specs/` | Handoff specs for UI flows | Frontend engineers |
| `product/` | Product vision, roadmap, scope | Team, stakeholders |
| `standards/` | Rules for how we write docs | All contributors |
| `releases/` | What changed in each release | All team members |

## Standards

All files here follow [`standards/documentation-framework.md`](standards/documentation-framework.md). Read it before adding or editing docs.

### TL;DR

- Filename: kebab-case, no numeric prefix (those are for `requirements/`).
- Every doc starts with the universal header (Title, Category, Version, Date, Status, one-line description, Related section).
- Ground every claim in code - quote source with file path + line range.
- One topic per document; split if over ~500 lines.
- Mermaid for diagrams; no explicit colors.
- Link out, don't duplicate.

## How to add a doc

Ask the agent:

```
document how authentication works
```

Or, for a specific category:

```
write an API reference for POST /api/users/me/export
```

The agent will consult the documentation framework, pick the right category, and write a doc that conforms to the standard.
