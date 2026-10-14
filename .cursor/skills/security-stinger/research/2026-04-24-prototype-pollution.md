# Prototype Pollution - Node.js / TypeScript Defense

**Sources:**
- https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html
- https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution
- https://portswigger.net/web-security/prototype-pollution/server-side
- https://www.nodejs-security.com/blog/understanding-and-preventing-prototype-pollution-in-nodejs/

**Retrieved:** 2026-04-24
**Query used:** "prototype pollution Node.js 2025 Object.hasOwn defense"

## Summary

Prototype pollution: attacker submits JSON like `{"__proto__": {"isAdmin": true}}`. A naive merge (`Object.assign(target, JSON.parse(body))`, Lodash `_.merge` on unsafe versions, manual recursive merge) writes the malicious key onto `Object.prototype`, polluting every object in the process. Subsequent auth checks like `if (user.isAdmin)` read the polluted value.

## Canonical defenses (layered)

1. **Schema-validate with Zod `.strict()`** (or `.passthrough(false)`). Rejects unknown keys like `__proto__`, `constructor`, `prototype`. This is the primary defense.
2. **Use `Object.hasOwn(obj, key)`** instead of `obj.key` or `key in obj` when checking flags like `isAdmin`.
3. **Use `Object.create(null)`** for internal maps and lookup tables - objects without a prototype cannot be polluted.
4. **`Map`** instead of plain objects for user-keyed caches.
5. **Node flags:** `--disable-proto=delete` removes `__proto__` entirely. Useful defense in depth but NOT sufficient alone (`constructor.prototype` still reachable).

## Example - DOMPurify fix (CVE-2024-45801)

DOMPurify patched its own prototype-pollution bug by switching internal lookups to `Object.hasOwn()` + `Object.create(null)`. Cite as the canonical example in the remediation playbook.

## Relevance to this stinger

- `guides/03-owasp-top-10.md` B8 retained verbatim, but expanded with `Object.hasOwn` and `Zod .strict()` as the two-line fix.
- `guides/05-remediation-playbooks.md` includes the DOMPurify-style pattern.
- `scripts/scan.sh` greps for `Object.assign(` with a JSON.parse argument, and for `_.merge(`/`_.defaultsDeep(` without a guard.
