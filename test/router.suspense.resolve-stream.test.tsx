import { describe, it, expect } from "../test-support/deno_vitest_shim.ts";
import { Router, type Env, type fragment } from "../src/router.mts";
import { Suspense, Resolve, SuspenseProvider } from "../src/components/suspense.mts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

const textDecoder = new TextDecoder();

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (s: string) => boolean,
): Promise<{ buffer: string; done: boolean }> {
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return { buffer, done };
    buffer += textDecoder.decode(value, { stream: true });
    if (predicate(buffer)) return { buffer, done: false };
  }
}

describe("Resolve streams resolved suspense chunks", () => {
  it("streams templates for resolved Suspense content", async () => {
    const pattern = new URLPattern({ pathname: "/resolve-stream" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <SuspenseProvider>
              <html>
                <body>
                  <h1>App</h1>
                  <Suspense fallback={<div>FALLBACK</div>}>
                    {async () => {
                      await sleep(50);
                      return <div>READY</div>;
                    }}
                  </Suspense>
                  <Resolve />
                </body>
              </html>
            </SuspenseProvider>
          ),
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/resolve-stream"),
      {} as Env,
      ctx,
    );

    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const reader = res.body!.getReader();

    // First chunk should include fallback, but not the resolved content yet
    const first = await readUntil(reader, (t) => t.includes("FALLBACK"));
    expect(first.done).toBe(false);
    expect(first.buffer).toContain("FALLBACK");
    expect(first.buffer).not.toContain("READY");
    expect(first.buffer).not.toMatch(/<template\s+data-rw-target/);

    // Read to the end and verify Resolve emitted the streaming chunk
    let full = first.buffer;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += textDecoder.decode(value, { stream: true });
    }

    // Expect Resolve emitted a template targeting the fallback element
    
    expect(full).toMatch(/<template\s+data-rw-target=\"suspense-[^"]+\"/);
    // Resolved HTML must be present
    expect(full).toContain("READY");

    // And ordering: resolved appears after fallback markup
    const iFallback = full.indexOf("FALLBACK");
    const iResolved = full.indexOf("READY");
    expect(iResolved).toBeGreaterThan(iFallback);
  });
});


