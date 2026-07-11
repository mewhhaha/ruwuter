# Co-locate client logic with JSX

**Status:** implemented (experimental opt-in) · **Size:** M · **Runtime cost:** zero by default

## Problem

Client behavior can't live in the same file as the JSX that owns it. Today a controller needs:

```tsx
// route.tsx
import type { PaletteController } from "./palette.client.ts";
import paletteControllerHref from "./palette.client.ts?url";
const paletteController = paletteControllerHref as ControllerHref<PaletteController>;
```

plus a separate `palette.client.ts` with the actual logic. The reading experience is: JSX in one
file, the behavior it describes in another, glued by a cast.

The root cause is structural, not stylistic: the browser loads controllers by URL
(`data-rw-controller` → dynamic `import()` in `src/runtime/client.ts`), so client code must exist as
a separately servable module. A route module can never be that module — it imports server-only code
and runs in workerd. **Something has to split the file.** The question is only who does the
splitting and how much machinery it takes.

## Options considered

### A. Inline `<script>` from `fn.toString()` — rejected

Serialize the function at render time and emit an inline module script. Rejected because it violates
standing project decisions (AGENTS.md: no serialized inline client payloads, keep CSP-friendly), the
serialized source is whatever the server bundler produced (not guaranteed browser-valid), and it
can't import anything. Recorded here so it doesn't get relitigated.

### B. Sibling-file codegen — cheap, but it's co-location by folder, not by file

Keep `.client.ts` files, generate the typed href glue. This is worth doing regardless and is written
up separately as [dx/01-typed-controller-hrefs](../dx/01-typed-controller-hrefs.md). It removes the
boilerplate pain but not the two-files pain.

### C. `client()` macro extracted by the Vite plugin — the actual experiment

Write the controller inline; a build-time transform extracts it into a virtual module:

```tsx
// route.tsx — everything in one file
import { client, controller, on } from "@mewhhaha/ruwuter/browser";

const palette = client<{
  props: { initiallyOpen: boolean };
  refs: { open: HTMLButtonElement; dialog: HTMLDialogElement };
}>(({ refs, props, signal }) => {
  if (props.initiallyOpen) refs.dialog.showModal();
  on(refs.open).click(() => refs.dialog.showModal(), { signal });
});

export default function Palette() {
  const mount = controller(palette, { initiallyOpen: false });
  return (
    <section {...mount.root()}>
      <button ref={mount.refs.open} type="button">Open</button>
      <dialog ref={mount.refs.dialog}>...</dialog>
    </section>
  );
}
```

The transform rewrites `client(fn)` on the server side into a plain `ControllerHref` string pointing
at a virtual module; the virtual module contains the extracted function source wrapped in
`defineController`, plus whichever module-level imports it references. The browser build pipeline
that already serves `?url` assets serves this module the same way.

## Why C is smaller than it looks

The reason "co-location" sounds like a big bundler effort is closure capture — Qwik's `$()` spends
its complexity budget serializing captured scope across the network. **Don't support capture.**
Constrain the macro hard:

1. `client(...)` only as a top-level `const` declaration in a module the plugin owns.
2. The callback may reference its own parameters and module-level **imports** (which the extractor
   hoists into the virtual module). Referencing any other module-level binding is a build error with
   a message telling you to pass it via props.
3. Props stay JSON-serialized through the existing `data-rw-props` attribute — no new wire format,
   no changes to `src/runtime/client.ts`, `src/components/client.ts`, or the router. The server
   runtime never learns this feature exists.

With those rules, extraction is text surgery, not compilation:

- Work in `transform` with `enforce: "post"` so TSX is already JS, then use Rollup's built-in
  `this.parse()` for the AST — **no new parser dependency**.
- Find top-level `client(...)` calls; record the span of the callback argument.
- Compute the callback's free identifiers (one small scope walk); verify each resolves to an import;
  error otherwise.
- Emit virtual module `\0ruwuter-client:<file>:<n>` = the referenced import statements +
  `export
  default (<callback source>);` — `magic-string` slices, source maps fall out.
- In the original module, replace the call with the resolved URL string (dev: the virtual module id
  as a servable path; build: `emitFile` + `import.meta.ROLLUP_FILE_URL_...`, the same mechanics
  `?url` uses today).
- Type-level: `client<Definition>(fn)` is declared in `src/browser.ts` to return
  `ControllerHref<Definition>`; if the transform never runs (plain Deno, no Vite), the untransformed
  function throws at first use with a "requires the ruwuter vite plugin" message, so failure is
  loud, not silent.

Estimated shape: one new file `src/vite/client-macro.ts` (~300–400 lines including errors) wired
into the existing `ruwuter()` plugin behind an option (`clientMacro: true` while experimental), plus
the `client()` declaration (~20 lines of types) in `src/browser.ts`.

## Risks / open questions

- **Dev vs build URL plumbing.** Dev serves virtual ids through the module graph; build needs
  emitted chunks. This is the fiddliest part — prototype it first with a hardcoded extraction before
  writing the AST walk.
- **The transform sees post-esbuild JS.** Callback source is transpiled (no TS syntax left), which
  is exactly what the browser needs — but it means the extracted code is only as readable as esbuild
  output. Source maps cover debugging.
- **Two `client()` calls sharing helpers.** Rule 2 forces shared helpers into an imported module.
  That's the right pressure (shared client code is a real module), but document it.
- **Deno-only users (no Vite) keep the current `.client.ts` pattern.** The macro is sugar over the
  same primitive, not a replacement. README should present both.

## Smallest version worth shipping

Prototype in a branch: hardcode extraction of exactly one `client()` per file, no free-variable
validation, dev mode only. If the URL plumbing works and the ergonomics feel right in a demo app,
invest in the scope walk + build mode. If dev-mode plumbing is miserable, stop — option B already
banks most of the DX win.

## Implementation

The experiment advanced past the prototype behind `ruwuter({ clientMacro: true })`: multiple
top-level `client()` constants work in Vite dev and SSR builds, captured imports are rebased,
lexical module captures fail with a props-directed diagnostic, aliases/import forms are preserved,
and emitted hrefs are same-origin browser paths. Plain Deno keeps the sibling `.client.ts` path and
the untransformed function fails loudly.
