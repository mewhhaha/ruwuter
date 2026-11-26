/**
 * @module
 *
 * Progressive same-document View Transition helper supporting Level 2 `types`
 * and graceful fallback on browsers without `document.startViewTransition`.
 */

export interface ViewTransitionHandle {
  readonly finished: Promise<void>;
  readonly ready: Promise<void>;
  readonly updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

export interface BrowserViewTransitionOptions {
  /** View Transition Level 2 types exposed to `:active-view-transition-type(...)`. */
  types?: readonly string[];
  /** Skip animation (still running `update`) when `prefers-reduced-motion: reduce` matches. */
  respectReducedMotion?: boolean;
}

export type ViewTransitionOption = boolean | BrowserViewTransitionOptions;

type StartViewTransitionFn = (
  arg:
    | (() => void | Promise<void>)
    | { update: () => void | Promise<void>; types?: string[] },
) => ViewTransitionHandle;

/**
 * Runs a DOM mutation inside `document.startViewTransition` when supported,
 * resolving as soon as the DOM update completes (`updateCallbackDone`).
 * Returns the `ViewTransition` handle so callers can optionally await `.finished`.
 */
export async function viewTransition(
  update: () => void | Promise<void>,
  options?: BrowserViewTransitionOptions,
): Promise<ViewTransitionHandle | null> {
  const doc = typeof document < "u"
    ? (document as Document & { startViewTransition?: StartViewTransitionFn })
    : undefined;
  const start = doc?.startViewTransition;
  if (
    !start ||
    doc.visibilityState === "hidden" ||
    (options?.respectReducedMotion &&
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  ) {
    await update();
    return null;
  }

  let transition: ViewTransitionHandle;
  const types = options?.types;
  if (types?.length) {
    let ran = false;
    try {
      transition = start.call(doc, {
        update: () => {
          ran = true;
          return update();
        },
        types: [...types],
      });
    } catch (error) {
      if (ran || !(error instanceof TypeError)) throw error;
      transition = start.call(doc, update);
    }
  } else {
    transition = start.call(doc, update);
  }

  transition.ready?.catch(() => {});
  transition.finished?.catch(() => {});
  await transition.updateCallbackDone;
  return transition;
}
