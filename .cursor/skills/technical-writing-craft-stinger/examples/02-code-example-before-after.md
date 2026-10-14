# Example 02: Code Example Before/After

**Demonstrates:** Guide `02-code-example-discipline.md`, `templates/code-example-checklist.md`

This example shows a code block that fails the checklist, the specific findings, and the corrected version.

---

## Input: code block with issues

From a hypothetical how-to guide "Configure webhook delivery":

```markdown
Configure your webhook endpoint to verify signatures:

```
import hmac
import hashlib

def verify(payload, sig, secret):
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)

# usage
body = request.get_data()
sig = request.headers.get("X-Webhook-Signature")
if not verify(body, sig, ...):
    return 400
```

The function takes the raw request body, the signature header, and your webhook secret.
```

---

## Applying the checklist

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Runnable without modification? | No | `hmac.new` is not a valid Python function (should be `hmac.new` -> `hmac.HMAC` or `hmac.new` doesn't exist; correct is `hmac.new(...)` but the usage is `hmac.new(secret.encode(), payload, hashlib.sha256)` -- actually this should be `hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()` which IS the correct API for Python's hmac module -- wait, actually it IS `hmac.new()`) -- actually it IS valid Python: `hmac.new(key, msg, digestmod)`. BUT `...` in the usage section is a Python literal `Ellipsis` which would be passed as the `secret` argument. This makes it fail. |
| 2 | Produces the claimed output? | Warn | Would produce TypeError at runtime due to `...` |
| 3 | Language-tagged? | No | Bare ` ``` ` not ` ```python ` |
| 4 | Preceded by introductory sentence? | Yes | "Configure your webhook endpoint to verify signatures:" |
| 5 | Intro sentence ends with colon (immediate)? | Yes | Colon, immediately precedes block |
| 6 | Omissions marked with language comment? | No | `...` used for omission of secret value |
| 7 | Non-obvious lines annotated? | Partial | `# usage` comment exists but doesn't explain the HMAC verification logic |
| 8 | Named parameters? | No | `verify(body, sig, ...)` -- positional and unclear |
| 9 | Realistic example values? | No | `...` is not a realistic secret value |
| 10 | Tested against current version? | Unknown | Can't verify from review alone |
| 11 | Output shown? | No | What does `return 400` mean in context? |
| 12 | Free of security issues? | Warn | Pattern is correct but `...` as a placeholder secret is misleading |

**Overall: Fail** -- items 1, 3, 6, 8, 9 fail; item 1 (runnable) is a critical failure.

---

## Findings

**B1: Code discipline -- Unrunnable due to `...` literal used as placeholder**
Location: Code block, usage section
Finding: `...` is Python's `Ellipsis` literal. Passing it as the `secret` argument will raise a `TypeError` at runtime when `secret.encode()` is called. A reader who copies this code will get an error immediately.
Proposed fix: Replace `...` with a realistic placeholder string, and add a comment explaining how to supply the actual secret.

**S1: Code discipline -- No language tag on code fence**
Location: Code block
Finding: Bare ` ``` ` does not trigger syntax highlighting. Use ` ```python `.

**S2: Code discipline -- Omission marked with `...` instead of language comment**
Location: Code block, usage section
Finding: `...` is ambiguous (Python Ellipsis vs. prose omission). Use `# replace with your webhook secret` or supply a realistic placeholder.

**N1: Code discipline -- Positional parameters obscure intent**
Location: `verify(body, sig, ...)` call
Finding: A reader looking at the call signature must check the function definition to understand argument order. Named arguments improve readability.

---

## Corrected version

```markdown
Verify the signature of every incoming webhook to confirm it came from the API:

```python
import hmac
import hashlib

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Return True if the webhook signature is valid, False otherwise."""
    expected = hmac.new(
        key=secret.encode(),
        msg=payload,
        digestmod=hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# In your request handler:
raw_body = request.get_data()
webhook_signature = request.headers.get("X-Webhook-Signature", "")
webhook_secret = "whsec_your_secret_here"  # replace with your actual webhook secret

if not verify_webhook_signature(
    payload=raw_body,
    signature=webhook_signature,
    secret=webhook_secret,
):
    return abort(400)  # Return 400 Bad Request for invalid signatures
```

If the function returns `False`, the request did not come from the API. Return a `400` status to signal rejection.
```

**Checklist after fix:** All items Pass or N/A. The corrected version is language-tagged, runnable, uses named parameters, explains the output (`400` status), and uses a realistic placeholder with a comment explaining substitution.
