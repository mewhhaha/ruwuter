---
title: Keep Client and Resolve Runtimes Explicit
impact: CRITICAL
impactDescription: Prevents missing hydration and streamed Suspense resolution paths.
tags: ruwuter, runtime, suspense, csp
---

## Keep Client and Resolve Runtimes Explicit

Load runtime modules intentionally based on features in use.

**Preferred setup:**

```tsx
<>
  <Client nonce={cspNonce} />
  <script type="module" src="@mewhhaha/ruwuter/resolve.js"></script>
</>
```

Guidance:

- Use `<Client />` whenever client events/lifecycle hooks are expected.
- Include `@mewhhaha/ruwuter/resolve.js` when streamed Suspense templates are emitted.
- Use `<Client nonce={...} />` under strict CSP.
