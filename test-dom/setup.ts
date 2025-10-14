// Ensure URLPattern is available in the jsdom environment.
// Node 20+ provides URLPattern globally, but the jsdom environment
// may not carry it over. If missing, polyfill it.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (typeof (globalThis as any).URLPattern === "undefined") {
  try {
    // Importing this module defines URLPattern globally
    // and also exports it; we ensure the global assignment.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import("urlpattern-polyfill");
    const URLPatternCtor =
      (mod as any).URLPattern ?? (globalThis as any).URLPattern;
    if (URLPatternCtor) {
      Object.defineProperty(globalThis, "URLPattern", {
        value: URLPatternCtor,
        configurable: true,
        writable: true,
      });
    }
  } catch {
    // If the polyfill isn't installed, tests that rely on URLPattern will fail.
  }
}
