/**
 * Small helpers for serializing inline client code safely.
 */

/**
 * Replace bundler SSR dynamic import shims with real `import()` calls.
 * Handles common Vite placeholders found in serialized function sources.
 */
export function sanitizeDynamicImportSource(src: string): string {
  return src
    .replaceAll("globalThis.__vite_ssr_dynamic_import__", "import")
    .replaceAll("__vite_ssr_dynamic_import__", "import");
}

