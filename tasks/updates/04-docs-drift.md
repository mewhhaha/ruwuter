# Fix documentation drift

**Status:** implemented · **Size:** XS · **Files:** `AGENTS.md`, `README.md`, `examples/`

Places where the docs disagree with the code as of 0.4.2:

1. **`AGENTS.md:84`** — "Preserve public APIs in `src/client.ts`, ..." — `src/client.ts` does not
   exist. The public surfaces are `src/browser.ts`, `src/components/client.ts`, and
   `src/runtime/client.ts`.
2. **`AGENTS.md:62`** — "CLI: `node src/fs-routes/routes.ts ./app`" — this is a Deno project; the
   README says `deno run -A npm:@mewhhaha/ruwuter/fs-routes ./app`. Pick one story (and see point 4
   — the `npm:` specifier is questionable given JSR publishing).
3. **`examples/client-scope-dialog.tsx:4`** — casts a raw relative string to `ControllerHref`
   instead of importing via `?url` as the README teaches. If the example is meant to show the
   no-bundler path, say so in a comment; otherwise align it with the README.
4. **`README.md` install section** — says `pnpm add @mewhhaha/ruwuter`, but `publish.yml` runs
   `npx jsr publish`. The npm-compatible install for a JSR package is
   `pnpm add
   jsr:@mewhhaha/ruwuter` (or `deno add jsr:@mewhhaha/ruwuter`). Verify what actually
   resolves and document that; the `npm:@mewhhaha/ruwuter/fs-routes` run command in the README needs
   the same check.
5. **`AGENTS.md` checklist** says "README examples stay in sync with behavior" — add
   `docs/SKILLS.md` to that sentence; it's the bigger doc and already asks to be kept in sync with
   the README.

None of these need discussion — they're just edits once point 4's install story is confirmed.

## Implementation

The repository and published CLI examples now use Deno/JSR, install commands use the documented
`jsr:` package-manager syntax, public source paths are current, the controller example uses the Vite
controller URL pipeline, and README/`docs/SKILLS.md`/AGENTS guidance is synchronized.
