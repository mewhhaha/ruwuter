# Enforce the size budget in CI

**Status:** proposal · **Size:** XS · **Files:** `.github/workflows/ci.yml`, `deno.json`

## Problem

"Ruwuter should be really small" is a stated goal but not a measured one. The browser-shipped
modules are the part where bytes directly cost users: `src/runtime/client.ts`,
`src/runtime/resolve.ts`, `src/runtime/swap.ts`. Nothing today notices if a change doubles them.

## Proposal

A `deno task size` that bundles each browser entrypoint (e.g. `deno bundle` or esbuild via
`deno run npm:esbuild`), minifies, gzips, and fails if any exceeds a checked-in budget:

```
client.js   ≤ 3.5 kB gzip   (currently ~2.x — measure and set budgets from reality + ~20%)
resolve.js  ≤ 1 kB gzip
swap.js     ≤ 2.5 kB gzip
```

Run it in CI next to the other checks and print actual sizes in the job output so trends are visible
in PRs.

Optionally also track the server core (`src/router.ts` + `src/runtime/jsx*.ts` + `node.ts`) as a
soft number in the README badge sense — but the hard gate should be the browser bytes.

This also gives every task in this folder a shared acceptance criterion: if a proposal can't fit
inside the budgets, it belongs in build tooling or an opt-in entrypoint instead.
