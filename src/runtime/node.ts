/**
 * Internal symbol for Html type identification.
 * @internal
 */
export const N: unique symbol = Symbol();

type StreamOptions = { signal?: AbortSignal; onCancel?: (reason: unknown) => void };

const encoder = new TextEncoder();

/**
 * A deferred (non-string) part of an Html value. Deferred parts are resolved
 * during rendering: functions are called, promises awaited, iterables walked.
 * `esc` controls whether plain strings produced by the value are HTML-escaped.
 * @internal
 */
export type Deferred = { v: unknown; esc: boolean };

/**
 * One part of an Html value: either finished markup (string) or a deferred value.
 * Adjacent strings are pre-joined when the tree is built, so a fully static
 * subtree collapses into a single string part.
 * @internal
 */
export type Part = string | Deferred;

/**
 * Html type for streaming HTML content with async generation support.
 */
export type Html = {
  [N]: true;
  parts: Part[];
  readonly generator: AsyncGenerator<string>;
  toPromise: () => Promise<string>;
  toReadableStream: (options?: StreamOptions) => ReadableStream<Uint8Array>;
};

const ESCAPE_PATTERN = /[&<>"']/;

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * @param input - String to escape
 * @returns Escaped string safe for HTML output
 */
export function escapeHtml(input: string): string {
  if (!ESCAPE_PATTERN.test(input)) return input;
  return input.replaceAll(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

const isAsyncIterable = (value: object): value is AsyncIterable<unknown> => {
  return Symbol.asyncIterator in value;
};

const isIterable = (value: object): value is Iterable<unknown> => {
  return Symbol.iterator in value;
};

/**
 * Renders an Html tree to string chunks. Synchronously available content is
 * accumulated into a buffer that is only flushed right before an actual await,
 * so the number of emitted chunks matches the number of async boundaries in
 * the tree rather than the number of nodes.
 */
const render = (root: Html): AsyncGenerator<string> => {
  let buffer = "";

  async function* walk(value: unknown, esc: boolean): AsyncGenerator<string> {
    // Booleans render nothing, matching `null`/`undefined`.
    if (value == null || typeof value === "boolean") return;

    switch (typeof value) {
      case "string":
        buffer += esc ? escapeHtml(value) : value;
        return;
      case "number":
      case "bigint":
        buffer += value.toString();
        return;
      case "function":
        yield* walk((value as () => unknown)(), esc);
        return;
      case "object":
        break;
      default: {
        const text = String(value);
        buffer += esc ? escapeHtml(text) : text;
        return;
      }
    }

    if (isHtml(value)) {
      for (const part of value.parts) {
        if (typeof part === "string") {
          buffer += part;
        } else {
          yield* walk(part.v, part.esc);
        }
      }
      return;
    }

    if (value instanceof Response) {
      throw value;
    }

    if (value instanceof Promise) {
      if (buffer) {
        // Cancellation can close this generator at the yield before it reaches the await.
        value.catch(() => {});
        yield buffer;
        buffer = "";
      }
      yield* walk(await value, esc);
      return;
    }

    if (isAsyncIterable(value)) {
      const iterator = value[Symbol.asyncIterator]();
      let completed = false;
      try {
        while (true) {
          if (buffer) {
            yield buffer;
            buffer = "";
          }
          const step = await iterator.next();
          if (step.done) {
            completed = true;
            return;
          }
          yield* walk(step.value, esc);
        }
      } finally {
        if (!completed) await iterator.return?.(undefined);
      }
    }

    if (isIterable(value)) {
      for (const item of value) {
        yield* walk(item, esc);
      }
      return;
    }

    const text = String(value);
    buffer += esc ? escapeHtml(text) : text;
  }

  return (async function* (): AsyncGenerator<string> {
    yield* walk(root, false);
    if (buffer) yield buffer;
  })();
};

const htmlPrototype = {
  [N]: true as const,

  get generator(): AsyncGenerator<string> {
    return render(this as unknown as Html);
  },

  async toPromise(this: Html): Promise<string> {
    let result = "";
    for await (const chunk of this.generator) {
      result += chunk;
    }
    return result;
  },

  toReadableStream(
    this: Html,
    { signal, onCancel }: StreamOptions = {},
  ): ReadableStream<Uint8Array> {
    const generator = this.generator;
    let closed = false;
    let abort: (() => void) | undefined;
    const finish = () => {
      closed = true;
      if (abort) signal?.removeEventListener("abort", abort);
    };
    const stop = () => {
      finish();
      // A user promise may never settle. The reader must still be released immediately.
      void generator.return(undefined).catch(() => {});
    };

    return new ReadableStream({
      start(controller) {
        if (!signal) return;
        abort = () => {
          stop();
          controller.error(signal.reason);
        };
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      },
      async pull(controller) {
        if (closed) return;
        try {
          const step = await generator.next();
          if (closed) return;
          if (step.done) {
            finish();
            controller.close();
          } else {
            controller.enqueue(encoder.encode(step.value));
          }
        } catch (error) {
          if (!closed) {
            finish();
            controller.error(error);
            onCancel?.(error);
          }
        }
      },
      cancel(reason) {
        stop();
        onCancel?.(reason);
      },
    });
  },
};

/**
 * Creates an Html value from pre-built parts.
 * @internal
 */
export const fromParts = (parts: Part[]): Html => {
  const html = Object.create(htmlPrototype) as Html;
  html.parts = parts;
  return html;
};

/** Observe already-started work without running component functions or consuming iterators. */
export function observeInput(value: unknown, seen?: Set<unknown>): void {
  if (value instanceof Promise) {
    value.catch(() => {});
  } else if (Array.isArray(value)) {
    seen ??= new Set();
    if (seen.has(value)) return;
    seen.add(value);
    for (const child of value) observeInput(child, seen);
  }
}

/** Converts public render inputs to HTML, escaping ordinary text at any depth. */
export const into = (value: unknown): Html => {
  if (isHtml(value)) return value;
  if (typeof value === "string") return fromParts([escapeHtml(value)]);
  observeInput(value);
  return fromParts([{ v: value, esc: true }]);
};

/** Inserts an explicitly trusted string of application-generated markup. */
export function unsafeHTML(markup: string): Html {
  if (typeof markup !== "string") throw new TypeError("unsafeHTML expects a string.");
  return fromParts([markup]);
}

/** Internal generators have already escaped their text chunks. */
export const rendered = (chunks: AsyncGenerator<string>): Html =>
  fromParts([{ v: chunks, esc: false }]);

/**
 * Type guard to check if a value is an Html instance.
 *
 * @param child - Value to check
 * @returns True if the value is Html
 */
export const isHtml = (child: unknown): child is Html => {
  return (
    typeof child === "object" &&
    child !== null &&
    N in child &&
    child[N] === true
  );
};
