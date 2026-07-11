// deno-lint-ignore-file no-explicit-any
import { DOMParser as LinkeDOMParser } from "linkedom";
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { enhanceNavigation } from "../src/runtime/navigate.ts";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => resolve = done);
  return { promise, resolve };
};

class FakeNavigateEvent extends Event {
  #abort = new AbortController();
  canIntercept = true;
  destination: { url: string };
  downloadRequest: string | null = null;
  formData: FormData | null = null;
  hashChange = false;
  navigationType: "push" | "reload" | "replace" | "traverse" = "push";
  sourceElement: Element | null = null;
  handler?: () => Promise<void>;

  constructor(url: string) {
    super("navigate");
    this.destination = { url };
  }

  get signal() {
    return this.#abort.signal;
  }

  abort() {
    this.#abort.abort();
  }

  intercept(options: { handler: () => Promise<void> }) {
    this.handler = options.handler;
  }
}

class FakeNavigation extends EventTarget {
  #current?: FakeNavigateEvent;

  navigate(event: FakeNavigateEvent) {
    this.#current?.abort();
    this.#current = event;
    this.dispatchEvent(event);
  }
}

const setupDom = (navigation?: FakeNavigation, body = "<main>current</main>") => {
  const saved = {
    DOMParser: (globalThis as any).DOMParser,
    document: (globalThis as any).document,
    Element: (globalThis as any).Element,
    location: (globalThis as any).location,
    navigation: (globalThis as any).navigation,
    Node: (globalThis as any).Node,
    window: (globalThis as any).window,
  };
  const document = new LinkeDOMParser().parseFromString(
    `<!doctype html><html><head><title>Current</title></head><body>${body}</body></html>`,
    "text/html",
  )! as unknown as Document;
  const assigned: string[] = [];

  (document as any).startViewTransition = (update: () => void) => {
    update();
    return { finished: Promise.resolve() };
  };
  (globalThis as any).DOMParser = LinkeDOMParser;
  (globalThis as any).document = document;
  (globalThis as any).Element = (document.createElement("div") as any).constructor;
  (globalThis as any).Node = (document.createTextNode("") as any).constructor;
  (globalThis as any).location = {
    assign(url: string) {
      assigned.push(url);
    },
    href: "https://example.test/current",
    origin: "https://example.test",
  };
  (globalThis as any).navigation = navigation;
  (globalThis as any).window = { document };

  return {
    assigned,
    document,
    cleanup() {
      for (const [name, value] of Object.entries(saved)) {
        if (typeof value === "undefined") delete (globalThis as any)[name];
        else (globalThis as any)[name] = value;
      }
    },
  };
};

describe("enhanced navigation runtime", () => {
  it("progressively falls back when the Navigation API is unavailable", () => {
    const { cleanup } = setupDom();
    try {
      const stop = enhanceNavigation();
      stop();
    } finally {
      cleanup();
    }
  });

  it("extracts the matching target from a full same-origin document", async () => {
    const navigation = new FakeNavigation();
    const { document, cleanup } = setupDom(navigation);
    const requests: Array<{ input: string; init?: RequestInit }> = [];

    try {
      const stop = enhanceNavigation({
        fetch: ((input: URL | RequestInfo, init?: RequestInit) => {
          requests.push({ input: input.toString(), init });
          return Promise.resolve(
            new Response(
              "<!doctype html><html><head><title>Next</title></head>" +
                "<body><main>next</main></body></html>",
              { headers: { "Content-Type": "text/html" } },
            ),
          );
        }) as typeof fetch,
      });
      const event = new FakeNavigateEvent("https://example.test/next");

      navigation.navigate(event);
      await event.handler?.();

      expect(requests.length).toBe(1);
      expect(requests[0].input).toBe("https://example.test/next");
      expect(requests[0].init?.method).toBe("GET");
      expect(document.body.innerHTML).toBe("<main>next</main>");
      expect(document.title).toBe("Next");
      stop();
    } finally {
      cleanup();
    }
  });

  it("preserves urlencoded POST form data and renders HTML error responses", async () => {
    const navigation = new FakeNavigation();
    const { document, cleanup } = setupDom(navigation);
    let requestInit: RequestInit | undefined;

    try {
      const stop = enhanceNavigation({
        fetch: ((_input: URL | RequestInfo, init?: RequestInit) => {
          requestInit = init;
          return Promise.resolve(
            new Response("<html><body><p>invalid</p></body></html>", {
              status: 422,
              headers: { "Content-Type": "text/html" },
            }),
          );
        }) as typeof fetch,
      });
      const post = new FakeNavigateEvent("https://example.test/save");
      post.formData = new FormData();
      post.formData.set("name", "Ada Lovelace");
      const form = document.createElement("form") as HTMLFormElement;
      Object.defineProperty(form, "enctype", { value: "application/x-www-form-urlencoded" });
      const submitter = document.createElement("button");
      Object.defineProperty(submitter, "form", { value: form });
      post.sourceElement = submitter;

      navigation.navigate(post);
      await post.handler?.();

      expect(requestInit?.method).toBe("POST");
      expect(String(requestInit?.body)).toBe("name=Ada+Lovelace");
      expect(document.body.innerHTML).toBe("<p>invalid</p>");
      stop();
    } finally {
      cleanup();
    }
  });

  it("uses the configured meta target without replacing the surrounding body", async () => {
    const navigation = new FakeNavigation();
    const { document, cleanup } = setupDom(
      navigation,
      '<main id="app"><p>current</p></main><footer>keep</footer>',
    );
    try {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "rw-navigate-target");
      meta.setAttribute("content", "#app");
      document.head.append(meta);
      const stop = enhanceNavigation({
        fetch: (() =>
          Promise.resolve(
            new Response('<html><body><main id="app"><p>next</p></main></body></html>', {
              headers: { "Content-Type": "text/html" },
            }),
          )) as typeof fetch,
      });
      const event = new FakeNavigateEvent("https://example.test/next");
      navigation.navigate(event);
      await event.handler?.();

      expect(document.querySelector("#app")?.innerHTML).toBe("<p>next</p>");
      expect(document.querySelector("footer")?.textContent).toBe("keep");
      stop();
    } finally {
      cleanup();
    }
  });

  it("ignores external, hash, download, and non-interceptable navigations", () => {
    const navigation = new FakeNavigation();
    const { document, cleanup } = setupDom(navigation);
    try {
      const stop = enhanceNavigation();
      const external = new FakeNavigateEvent("https://other.test/");
      const hash = new FakeNavigateEvent("https://example.test/current#details");
      hash.hashChange = true;
      const download = new FakeNavigateEvent("https://example.test/file");
      download.downloadRequest = "file";
      const blocked = new FakeNavigateEvent("https://example.test/blocked");
      blocked.canIntercept = false;
      const reload = new FakeNavigateEvent("https://example.test/streamed");
      reload.sourceElement = document.createElement("a");
      reload.sourceElement.setAttribute("data-rw-reload", "");
      const browserReload = new FakeNavigateEvent("https://example.test/current");
      browserReload.navigationType = "reload";
      for (const event of [external, hash, download, blocked, reload, browserReload]) {
        navigation.navigate(event);
      }

      expect(external.handler).toBe(undefined);
      expect(hash.handler).toBe(undefined);
      expect(download.handler).toBe(undefined);
      expect(blocked.handler).toBe(undefined);
      expect(reload.handler).toBe(undefined);
      expect(browserReload.handler).toBe(undefined);
      stop();
    } finally {
      cleanup();
    }
  });

  it("removes its listener before falling back to a hard navigation", async () => {
    const navigation = new FakeNavigation();
    const { assigned, cleanup } = setupDom(navigation);
    const originalError = console.error;
    console.error = () => {};
    try {
      enhanceNavigation({
        fetch: (() =>
          Promise.resolve(
            new Response("{}", { headers: { "Content-Type": "application/json" } }),
          )) as typeof fetch,
      });
      const failed = new FakeNavigateEvent("https://example.test/fail");
      navigation.navigate(failed);
      await failed.handler?.();

      const repeated = new FakeNavigateEvent("https://example.test/fail");
      navigation.navigate(repeated);
      expect(assigned).toEqual(["https://example.test/fail"]);
      expect(repeated.handler).toBe(undefined);
    } finally {
      console.error = originalError;
      cleanup();
    }
  });

  it("replays a failed enhanced POST through the native form", async () => {
    const navigation = new FakeNavigation();
    const { assigned, document, cleanup } = setupDom(navigation);
    const originalError = console.error;
    console.error = () => {};
    let submitted = 0;
    try {
      enhanceNavigation({
        fetch: (() =>
          Promise.resolve(
            new Response("{}", { headers: { "Content-Type": "application/json" } }),
          )) as typeof fetch,
      });
      const event = new FakeNavigateEvent("https://example.test/save");
      event.formData = new FormData();
      const form = document.createElement("form") as HTMLFormElement;
      Object.defineProperty(form, "enctype", { value: "application/x-www-form-urlencoded" });
      Object.defineProperty(form, "requestSubmit", { value: () => submitted++ });
      const submitter = document.createElement("button");
      Object.defineProperty(submitter, "form", { value: form });
      event.sourceElement = submitter;

      navigation.navigate(event);
      await event.handler?.();

      expect(submitted).toBe(1);
      expect(assigned.length).toBe(0);
    } finally {
      console.error = originalError;
      cleanup();
    }
  });

  it("does not let a superseded response overwrite the newer page", async () => {
    const navigation = new FakeNavigation();
    const { assigned, document, cleanup } = setupDom(navigation);
    const first = deferred<Response>();
    const second = deferred<Response>();
    try {
      enhanceNavigation({
        fetch: ((input: URL | RequestInfo) =>
          input.toString().endsWith("/first") ? first.promise : second.promise) as typeof fetch,
      });
      const firstEvent = new FakeNavigateEvent("https://example.test/first");
      navigation.navigate(firstEvent);
      const firstHandling = firstEvent.handler?.();

      const secondEvent = new FakeNavigateEvent("https://example.test/second");
      navigation.navigate(secondEvent);
      const secondHandling = secondEvent.handler?.();
      second.resolve(
        new Response("<html><body><p>second</p></body></html>", {
          headers: { "Content-Type": "text/html" },
        }),
      );
      await secondHandling;
      first.resolve(
        new Response("<html><body><p>first</p></body></html>", {
          headers: { "Content-Type": "text/html" },
        }),
      );
      await firstHandling;

      expect(document.body.innerHTML).toBe("<p>second</p>");
      expect(assigned.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("hard-loads destinations that opt back into progressive streaming", async () => {
    const navigation = new FakeNavigation();
    const { assigned, document, cleanup } = setupDom(navigation);
    try {
      enhanceNavigation({
        fetch: (() =>
          Promise.resolve(
            new Response(
              '<html><head><meta name="rw-navigate" content="reload"></head>' +
                "<body><p>streamed shell</p></body></html>",
              { headers: { "Content-Type": "text/html" } },
            ),
          )) as typeof fetch,
      });
      const event = new FakeNavigateEvent("https://example.test/streamed");
      navigation.navigate(event);
      await event.handler?.();

      expect(assigned).toEqual(["https://example.test/streamed"]);
      expect(document.body.innerHTML).toBe("<main>current</main>");
    } finally {
      cleanup();
    }
  });
});
