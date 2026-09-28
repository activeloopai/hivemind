# Rules File Backdoor - Hidden-Unicode Prompt Injection in Cursor / Copilot

**Sources:**
- https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor-how-hackers-can-weaponize-code-agents
- https://thehackernews.com/2025/03/new-rules-file-backdoor-attack-lets.html
- https://www.promptfoo.dev/blog/invisible-unicode-threats/
- https://securityaffairs.com/175593/hacking/rules-file-backdoor-ai-code-editors-silent-supply-chain-attacks.html
- https://cloudsecurityalliance.org/blog/2025/05/06/secure-vibe-coding-level-up-with-cursor-rules-and-the-r-a-i-l-g-u-a-r-d-framework
- https://ship-safe.co/blog/cursor-security-risks

**Retrieved:** 2026-04-24
**Query used:** "Cursor rules file backdoor hidden Unicode characters prompt injection"

## Summary

Pillar Security disclosed (March 2025) that attackers can plant invisible Unicode characters inside `.cursor/rules/**` and `.cursorrules` files. The AI reads the hidden payload (zero-width joiners, bidirectional markers) and silently injects malicious instructions into code generation - e.g., exfiltrate env vars, add a backdoor endpoint - while humans and normal linters see a benign rules file. Once committed, the malicious rules file survives forks and affects every future generation.

## Unicode characters to scan for

| Hex | Name |
|---|---|
| `U+200B` | Zero-width space |
| `U+200C` | Zero-width non-joiner |
| `U+200D` | Zero-width joiner |
| `U+2060` | Word joiner |
| `U+FEFF` | Zero-width no-break space / BOM |
| `U+202A`-`U+202E` | LTR/RTL embedding & override (bidi) |
| `U+2066`-`U+2069` | LTR/RTL isolate |

## Key quotations

> "Attackers exploit this by embedding hidden malicious instructions inside rules files, often using invisible Unicode characters that evade human and automated detection during code reviews."

> "Following Pillar's research, GitHub implemented a new security feature that displays a warning when a file's contents include hidden Unicode text on github.com."

## Relevance to this stinger

- `guides/02-vibe-coding-patterns.md` Rule A4 (Rules File Backdoor) - scan `.cursor/rules/**`, `.cursorrules`, and any `AGENTS.md`/`CLAUDE.md`/`.github/copilot-instructions.md` for the codepoints above.
- `scripts/scan.sh` bundles a deterministic Unicode scan: `grep -P '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2069}\x{FEFF}]'`.
- Any hit is automatically **Critical** - silent supply-chain backdoor.
