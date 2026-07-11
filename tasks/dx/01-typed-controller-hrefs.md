# Generate typed controller hrefs

**Status:** proposal · **Size:** S · **Runtime cost:** zero

## Problem

Every controller use site repeats the same three-line ritual:

```tsx
import type { PaletteController } from "./palette.client.ts";
import paletteControllerHref from "./palette.client.ts?url";
const paletteController = paletteControllerHref as ControllerHref<PaletteController>;
```

The `as ControllerHref<...>` cast is the weak point: nothing checks that the type import and the
`?url` import point at the same module, or that the named type matches the module's actual default
export. `examples/client-scope-dialog.tsx` shows how easily this drifts — it casts a raw relative
string instead of a `?url` import.

## Proposal

ruwuter already generates code from the app folder (`src/fs-routes/`). Extend that same sweep: for
each `*.client.ts` under the app folder, emit one entry in a generated `app/controllers.ts`:

```ts
// generated — do not edit
import type { ControllerHref } from "@mewhhaha/ruwuter/browser";

import openPaletteHref from "./routes/palette/open-palette.client.ts?url";
export const openPalette = openPaletteHref as ControllerHref<
  typeof import("./routes/palette/open-palette.client.ts")["default"] extends
    import("@mewhhaha/ruwuter/browser").DefinedController<infer D> ? D : never
>;
```

(Or simpler: export a `ControllerHrefOf<typeof import("...")>` helper type from `src/browser.ts`
that does the `DefinedController` unwrapping, and let the generated file stay one line per
controller.)

Use sites become:

```tsx
import { openPalette } from "../controllers.ts";
const palette = controller(openPalette);
```

The cast lives in exactly one generated place, and it's derived from the module's real default
export — rename the definition type and the href type follows.

## Notes

- `DefinedController` already brands the definition (`src/components/client.ts`), so the inference
  helper is a few lines.
- The Vite plugin (`src/vite.ts`) already watches and regenerates; add `*.client.ts` to the watched
  set (currently only `routes/` triggers regeneration — controllers can live there anyway).
- Deno-without-Vite users can't use `?url`, so gate this behind the Vite plugin path or make the
  emitted href expression configurable.
- This is the cheap 80% of the co-location ask
  ([experiments/01](../experiments/01-colocate-client-logic.md)); ship it first and see how much
  appetite remains for the macro.
