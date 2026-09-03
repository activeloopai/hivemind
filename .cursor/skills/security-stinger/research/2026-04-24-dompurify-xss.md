# React `dangerouslySetInnerHTML` + DOMPurify - XSS Prevention

**Sources:**
- https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- https://react.dev/reference/react-dom/components/common#common-security-pitfalls
- https://deadsimplechat.com/blog/how-to-safely-use-dangerouslysetinnerhtml-in-react/
- https://pragmaticwebsecurity.com/articles/spasecurity/react-xss-part2.html
- https://github.com/cure53/DOMPurify

**Retrieved:** 2026-04-24
**Query used:** "React dangerouslySetInnerHTML DOMPurify sanitization best practice 2025"

## Summary

JSX auto-escapes text - typing `{userInput}` is safe. The single dangerous opt-out is `dangerouslySetInnerHTML={{ __html: x }}`. If `x` is user-controlled or user-influenced (markdown rendered to HTML, rich-text editor output, CMS-provided snippets), sanitize with DOMPurify **before** assigning.

## Canonical safe wrapper

```tsx
import DOMPurify from 'isomorphic-dompurify';

const SAFE_CONFIG = {
  ALLOWED_TAGS: ['p','b','i','em','strong','a','ul','ol','li','br','blockquote','code','pre','h1','h2','h3'],
  ALLOWED_ATTR: ['href','target','rel'],
  ALLOW_DATA_ATTR: false,
};

export function SafeHTML({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, SAFE_CONFIG);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

- Use `isomorphic-dompurify` for Next.js (handles SSR with jsdom).
- Always include `rel="noopener noreferrer"` on anchors with `target="_blank"` (add as post-processing hook).
- A single `<SafeHTML />` component centralizes the risk - all raw-HTML rendering goes through it, easy to lint.

## Common mistake patterns (Stinger flags)

| Pattern | Severity |
|---|---|
| `dangerouslySetInnerHTML={{ __html: userInput }}` no sanitizer | **High** |
| `dangerouslySetInnerHTML={{ __html: marked(md) }}` without sanitizer | **High** (`marked` is not safe) |
| Home-rolled sanitizer with `.replace(/<script>/g, '')` | **High** (easily bypassed) |
| `dangerouslySetInnerHTML` on server-fetched constant string from your own CMS | **Medium** (still flag - CMS compromises are a thing) |

## Relevance to this stinger

- `guides/03-owasp-top-10.md` B10 (XSS under A05:2025 Injection).
- `guides/05-remediation-playbooks.md` ships the `SafeHTML` wrapper above.
- `scripts/scan.sh` greps `dangerouslySetInnerHTML` and reports every hit for human review.
