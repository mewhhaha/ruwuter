// Minimal indirection used by DOM tests to load the client runtime.
// Instead of embedding a base64 snapshot, point directly at the module in repo.

let seq = 0;

export function nextClientRuntimeUrl(): string {
  const url = new URL("../src/runtime/client.ts", import.meta.url);
  url.searchParams.set("v", `${seq++}`);
  return url.href;
}

export function nextResolveRuntimeUrl(): string {
  const url = new URL("../src/runtime/resolve.ts", import.meta.url);
  url.searchParams.set("v", `${seq++}`);
  return url.href;
}
