---
source_type: blog
authority: medium
relevance: high
topic: mcp-integration
url: https://claudefa.st/blog/tools/mcp-extensions/cursor-mcp-setup
fetched: 2026-05-20
---

# Cursor MCP Servers: Complete Setup Guide for 2026

## Summary

Published May 18, 2026. Practitioner guide covering Cursor MCP server setup from scratch with troubleshooting and comparison against Claude Code. Key value: the Cursor vs. Claude Code MCP comparison table and the troubleshooting section.

**Configuration locations:**
- Project-level: `.cursor/mcp.json`
- Global: `~/.cursor/mcp.json`

**Cursor vs Claude Code MCP comparison:**

| Feature | Cursor | Claude Code |
|---------|--------|-------------|
| Config location | `.cursor/mcp.json` | `~/.claude.json` or `.mcp.json` |
| Transport types | stdio, SSE, HTTP | stdio (HTTP/SSE in some preview builds) |
| OAuth support | Built-in OAuth flow | Manual token paste in `env` block |
| Tool search | Not available (all tools loaded at session start) | Tool Search (lazy loading on demand) |
| Resources | Not yet supported | Supported |
| Hot reload | Restart Cursor required | Reloads on `.mcp.json` edit in some builds |
| Per-project scope | `.cursor/mcp.json` works | `.mcp.json` works the same way |

**Troubleshooting steps:**
1. Open Cursor Settings, search "MCP", confirm "Enable MCP Servers" is checked
2. Run `MCP: View Server Status` from Command Palette to confirm servers loaded
3. Verify JSON syntax is valid
4. Check server logs via Help > Toggle Developer Tools > Console

**Key fact:** MCP server packages are interchangeable between Cursor and Claude Code - both speak the same protocol. The same `mcp.json` config block copies between tools with no modification.

## Key quotations

- "Cursor and Claude Code both speak the same Model Context Protocol, so server packages are interchangeable."
- "Tool search: Not available, all tools loaded at session start" (unlike Claude Code's lazy loading)
- "Resources: Not yet supported" in Cursor (unlike Claude Code)
- "Hot reload: Restart Cursor required for config changes" (unlike Claude Code's auto-reload)

## Relevance to the stinger

- Secondary backing for `guides/03-mcp-integration.md`: the "all tools loaded at session start" note (a reason to keep MCP servers scoped), the "Restart Cursor, no hot reload" friction point, and the View Server Status troubleshooting step.
- Config interpolation (`${env:VAR}`) is the safe way to inject secrets; the Hivemind server authenticates via its credentials file, so no secrets belong in `mcp.json`.
