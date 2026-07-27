import { expect, it } from "../test-support/deno_vitest_shim.ts";
import { bindGenerator } from "../src/router.ts";
import { createContext, runWithContextStore } from "../src/components/context.ts";

// The provider value lives in the request scope only. Nothing inside the page
// generator re-establishes it, so a read from resumed route code can only see
// "request" when `bindGenerator` restored the store it was bound with.
it("resumes the catch block inside the request context store", async () => {
  const theme = createContext("no-store");
  let observed = "unset";

  const page = (async function* (): AsyncGenerator<string> {
    try {
      yield "<!doctype html>";
    } catch (error) {
      observed = theme.use();
      throw error;
    }
  })();

  // Bound inside the request scope, advanced from outside it, just like a stream pull.
  const stream = runWithContextStore(() => theme.withValue("request", () => bindGenerator(page)));
  expect((await stream.next()).value).toBe("<!doctype html>");

  const failure = new Error("boom");
  let caught: unknown;
  try {
    await stream.throw(failure);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBe(failure);
  expect(observed).toBe("request");
});

it("resumes the finally block inside the request context store when closed early", async () => {
  const theme = createContext("no-store");
  let observed = "unset";

  const page = (async function* (): AsyncGenerator<string> {
    try {
      yield "<!doctype html>";
    } finally {
      observed = theme.use();
    }
  })();

  const stream = runWithContextStore(() => theme.withValue("request", () => bindGenerator(page)));
  expect((await stream.next()).value).toBe("<!doctype html>");
  await stream.return(undefined);

  expect(observed).toBe("request");
});
