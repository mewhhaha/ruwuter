// Minimal indirection used by DOM tests to load the client runtime.
// Instead of embedding a base64 snapshot, point directly at the module in repo.

export function nextClientRuntimeUrl(): string {
  return new URL("../src/runtime/client.ts", import.meta.url).href;
}

