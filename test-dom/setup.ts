// Ensure URLPattern is available in the jsdom environment.
// Node 20+ provides URLPattern globally, but the jsdom environment
// may not carry it over. If missing, polyfill it.

type URLPatternCtor = typeof URLPattern;
type URLPatternModule = { URLPattern?: URLPatternCtor };
type GlobalWithURLPattern = typeof globalThis & { URLPattern?: URLPatternCtor };

const globalWithURLPattern = globalThis as GlobalWithURLPattern;

if (typeof globalWithURLPattern.URLPattern === "undefined") {
  try {
    // Importing this module defines URLPattern globally
    // and also exports it; we ensure the global assignment.
    const mod = await import("urlpattern-polyfill") as unknown as URLPatternModule;
    const urlPatternCtor = mod.URLPattern ?? globalWithURLPattern.URLPattern;
    if (urlPatternCtor) {
      Object.defineProperty(globalThis, "URLPattern", {
        value: urlPatternCtor,
        configurable: true,
        writable: true,
      });
    }
  } catch {
    // If the polyfill isn't installed, tests that rely on URLPattern will fail.
  }
}
