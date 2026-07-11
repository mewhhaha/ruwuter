import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Suspense, SuspenseProvider } from "../src/components/suspense.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    expect(full).toMatch(/<template\s+data-rw-target="rw-[^"]+"/);
    // Resolved HTML must be present
    expect(full).toContain("READY");

    // And ordering: resolved appears after fallback markup
    const iFallback = full.indexOf("FALLBACK");
    const iResolved = full.indexOf("READY");
    expect(iResolved).toBeGreaterThan(iFallback);
  });

  it("contains rejected boundaries and keeps draining sibling resolutions", async () => {
    const pattern = new URLPattern({ pathname: "/resolve-errors" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <SuspenseProvider>
              <html>
                <body>
                  <Suspense fallback={<div>ERROR-FALLBACK-ONE</div>}>
                    {async () => {
                      await sleep(0);
                      throw new Error("first failure");
                    }}
                  </Suspense>
                  <Suspense
                    fallback={<div>ERROR-FALLBACK-TWO</div>}
                    errorFallback={(error) => (
                      <div>RECOVERED: {String((error as Error).message)}</div>
                    )}
                  >
                    {async () => {
                      await sleep(10);
                      throw new Error("second failure");
                    }}
                  </Suspense>
                  <Suspense fallback={<div>LOADING-SIBLING</div>}>
                    {async () => {
                      await sleep(20);
                      return <div>SIBLING-READY</div>;
                    }}
                  </Suspense>
                </body>
              </html>
            </SuspenseProvider>
          ),
        },
      },
    ];
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const router = Router([[pattern, fragments]]);
      const { ctx } = makeCtx();
      const res = await router.handle(
        new Request("https://example.com/resolve-errors"),
        {} as Env,
        ctx,
      );
      expect(res.status).toBe(200);
      const full = await new Response(res.body).text();

      expect(full).toContain("ERROR-FALLBACK-ONE");
      expect(full).toContain("ERROR-FALLBACK-TWO");
      expect(full).toContain("RECOVERED: second failure");
      expect(full).toContain("SIBLING-READY");
      expect(errors.length).toBe(2);
      expect((errors[0][1] as Error).message).toBe("first failure");
      expect((errors[1][1] as Error).message).toBe("second failure");
    } finally {
      console.error = originalError;
    }
  });

  it("leaves the fallback in place when its error fallback fails", async () => {
    const pattern = new URLPattern({ pathname: "/resolve-error-fallback" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <SuspenseProvider>
              <html>
                <body>
                  <Suspense
                    fallback={<div>KEEP-THIS-FALLBACK</div>}
                    errorFallback={() => {
                      throw new Error("error fallback failure");
                    }}
                  >
                    {async () => {
                      await sleep(0);
                      throw new Error("boundary failure");
                    }}
                  </Suspense>
                  <Suspense fallback={<div>LOADING-OTHER</div>}>
                    {async () => {
                      await sleep(0);
                      return <div>OTHER-READY</div>;
                    }}
                  </Suspense>
                </body>
              </html>
            </SuspenseProvider>
          ),
        },
      },
    ];
    const originalError = console.error;
    console.error = () => {};

    try {
      const router = Router([[pattern, fragments]]);
      const { ctx } = makeCtx();
      const res = await router.handle(
        new Request("https://example.com/resolve-error-fallback"),
        {} as Env,
        ctx,
      );
      const full = await new Response(res.body).text();

      expect(full).toContain("KEEP-THIS-FALLBACK");
      expect(full).toContain("OTHER-READY");
      expect(full).not.toContain("error fallback failure");
    } finally {
      console.error = originalError;
    }
  });
});
