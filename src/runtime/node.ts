/**
 * Internal symbol for streaming state.
 * @internal
 */
export const S: unique symbol = Symbol();

/**
 * Internal symbol for Html type identification.
 * @internal
 */
export const N: unique symbol = Symbol();

const encoder = new TextEncoder();

/**
 * Html type for streaming HTML content with async generation support.
 */
export type Html = {
  [N]: true;
  generator: AsyncGenerator<string>;
  toPromise: () => Promise<string>;
  toReadableStream: () => ReadableStream<Uint8Array>;
};

async function toPromise(this: Html): Promise<string> {
  let result = "";
  for await (const chunk of this.generator) {
    result += chunk;
  }
  return result;
}

function toReadableStream(this: Html): ReadableStream<Uint8Array> {
  const generator = this.generator;

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Converts various inputs into an Html instance for streaming.
 *
 * @param text - String, async generator, or promise to convert
 * @returns Html instance with streaming capabilities
 */
const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in (value as Record<symbol, unknown>)
  );
};

const isIterable = (value: unknown): value is Iterable<unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.iterator in (value as Record<symbol, unknown>)
  );
};

const toGenerator = (value: unknown): AsyncGenerator<string> => {
  return (async function* (): AsyncGenerator<string> {
    if (value == null || value === false) {
      return;
    }

    if (value instanceof Response) {
      throw value;
    }

    if (value instanceof Promise) {
      const resolved = await value;
      yield* toGenerator(resolved);
      return;
    }

    if (isHtml(value)) {
      yield* value.generator;
      return;
    }

    if (typeof value === "string") {
      yield value;
      return;
    }

    if (typeof value === "number" || typeof value === "bigint") {
      yield value.toString();
      return;
    }

    if (typeof value === "boolean") {
      if (value) {
        yield "true";
      }
      return;
    }

    if (isAsyncIterable(value)) {
      for await (const item of value) {
        yield* toGenerator(item);
      }
      return;
    }

    if (isIterable(value)) {
      for (const item of value) {
        yield* toGenerator(item);
      }
      return;
    }

    yield value.toString();
  })();
};

/**
 * Normalizes arbitrary values into the internal `Html` streaming container.
 */
export const into = (value: unknown): Html => {
  if (isHtml(value)) {
    return value;
  }

  return {
    [N]: true,
    generator: toGenerator(value),
    toPromise,
    toReadableStream,
  };
};

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
