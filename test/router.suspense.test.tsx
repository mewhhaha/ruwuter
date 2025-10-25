import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Suspense, SuspenseProvider } from "../src/components/suspense.ts";

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

describe("Suspense streaming", () => {
  it("streams fallback before async resolution", async () => {
    const pattern = new URLPattern({ pathname: "/s" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <SuspenseProvider>
              <html>
                <body>
                  <h1>App</h1>
                  <Suspense fallback={<div>Loading A</div>}>
                    {async () => {
                      await sleep(150);
                      return <div>A-DONE</div>;
                    }}
                  </Suspense>
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
      new Request("https://example.com/s"),
      {} as Env,
      ctx,
    );

    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const reader = res.body!.getReader();

    const first = await readUntil(reader, (t) => t.includes("Loading A"));
    expect(first.done).toBe(false);
    expect(first.buffer).toContain("<!doctype html>");
    expect(first.buffer).toContain("Loading A");
    expect(first.buffer).not.toContain("A-DONE");

    // Read the rest and verify resolved content appears after
    let full = first.buffer;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += textDecoder.decode(value, { stream: true });
    }

    const iFallback = full.indexOf("Loading A");
    const iResolved = full.indexOf("A-DONE");
    expect(iResolved).toBeGreaterThan(iFallback);
    expect(full).toContain("@mewhhaha/ruwuter/resolve");
  });

  it("resolves multiple suspense boundaries in completion order", async () => {
    const pattern = new URLPattern({ pathname: "/multi" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <SuspenseProvider>
              <html>
                <body>
                  <Suspense fallback={<div>Loading A</div>}>
                    {async () => {
                      await sleep(120);
                      return <div>A-DONE</div>;
                    }}
                  </Suspense>
                  <Suspense fallback={<div>Loading B</div>}>
                    {async () => {
                      await sleep(40);
                      return <div>B-DONE</div>;
                    }}
                  </Suspense>
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
      new Request("https://example.com/multi"),
      {} as Env,
      ctx,
    );

    const reader = res.body!.getReader();
    const first = await readUntil(
      reader,
      (t) => t.includes("Loading A") && t.includes("Loading B"),
    );
    expect(first.buffer).not.toContain("A-DONE");
    expect(first.buffer).not.toContain("B-DONE");

    // Finish stream
    let full = first.buffer;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += textDecoder.decode(value, { stream: true });
    }

    const iA = full.indexOf("A-DONE");
    const iB = full.indexOf("B-DONE");
    expect(iA).toBeGreaterThan(-1);
    expect(iB).toBeGreaterThan(-1);
    // B resolves faster, so it should appear earlier in the stream
    expect(iB).toBeLessThan(iA);
  });

  it("supports nested suspense boundaries with correct streaming order", async () => {
    const pattern = new URLPattern({ pathname: "/nested" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <SuspenseProvider>
              <html>
                <body>
                  <Suspense fallback={<div>OUTER-FALLBACK</div>}>
                    <div id="outer-slot">
                      <Suspense fallback={<div>INNER-FALLBACK</div>}>
                        {async () => {
                          await sleep(80);
                          return <div>INNER-READY</div>;
                        }}
                      </Suspense>
                    </div>
                  </Suspense>
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
      new Request("https://example.com/nested"),
      {} as Env,
      ctx,
    );

    const reader = res.body!.getReader();
    const first = await readUntil(reader, (t) => t.includes("OUTER-FALLBACK"));
    expect(first.buffer).toContain("OUTER-FALLBACK");
    expect(first.buffer).not.toContain("INNER-FALLBACK");
    expect(first.buffer).not.toContain("INNER-READY");

    const second = await readUntil(reader, (t) => t.includes('id="outer-slot"'));
    expect(second.buffer).toContain('id="outer-slot"');
    expect(second.buffer).not.toContain("INNER-READY");

    let full = second.buffer;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += textDecoder.decode(value, { stream: true });
    }
    expect(full).toContain("INNER-READY");
  });

  it("streams across fragments: layout fallback -> leaf fallback -> leaf ready", async () => {
    const pattern = new URLPattern({ pathname: "/xfrag" });
    const fragments: fragment[] = [
      // Root layout with Suspense around children
      {
        id: "layout",
        mod: {
          default: ({ children }: any) => (
            <SuspenseProvider>
              <html>
                <body>
                  <h1>Layout</h1>
                  <Suspense fallback={<div>LAYOUT-LOADING</div>}>
                    {children}
                  </Suspense>
                </body>
              </html>
            </SuspenseProvider>
          ),
        },
      },
      // Leaf renders async content behind its own Suspense
      {
        id: "leaf",
        mod: {
          default: () => (
            <div id="leaf">
              <Suspense fallback={<div>LEAF-FALLBACK</div>}>
                {async () => {
                  await sleep(60);
                  return <div>LEAF-READY</div>;
                }}
              </Suspense>
            </div>
          ),
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/xfrag"),
      {} as Env,
      ctx,
    );

    const reader = res.body!.getReader();
    const first = await readUntil(reader, (t) => t.includes("LAYOUT-LOADING"));
    expect(first.buffer).toContain("LAYOUT-LOADING");
    expect(first.buffer).not.toContain("LEAF-FALLBACK");
    expect(first.buffer).not.toContain("LEAF-READY");

    const second = await readUntil(reader, (t) => t.includes("LEAF-FALLBACK"));
    expect(second.buffer).toContain("LEAF-FALLBACK");
    expect(second.buffer).not.toContain("LEAF-READY");

    let full = second.buffer;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += textDecoder.decode(value, { stream: true });
    }
    expect(full).toContain("LEAF-READY");
  });
});
