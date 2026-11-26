import { assertEquals, assertThrows } from "@std/assert";
import { renderToString } from "../src/router.ts";
import { ViewTransition, ViewTransitions, vt } from "../src/components/index.ts";

Deno.test("ViewTransition and vt() emit zero-JS inline styles by default and merge caller styles", async () => {
  const markup = await renderToString(
    <ViewTransition
      as="article"
      name="product-42"
      share="hero card"
      class="box"
      style="color:red"
    >
      <img src="/a.png" alt="A" {...vt("art-42", { share: "hero-art" })} />
    </ViewTransition>,
  );

  assertEquals(
    markup,
    '<article class="box" style="view-transition-name:product-42;view-transition-class:hero card;color:red">' +
      '<img src="/a.png" alt="A" style="view-transition-name:art-42;view-transition-class:hero-art">' +
      "</article>",
  );
});

Deno.test("ViewTransition and vt() emit scoped data-rw-vt attributes when `for` is provided", async () => {
  const markup = await renderToString(
    <ViewTransition
      as="section"
      name="card-1"
      for={["/items/1", "/items/1/reviews"]}
      share="hero"
    >
      <h2 {...vt("title-1", { for: "*" })}>Keyboard</h2>
    </ViewTransition>,
  );

  assertEquals(
    markup,
    '<section data-rw-vt="card-1" data-rw-vt-for="/items/1 /items/1/reviews" data-rw-vt-class="hero">' +
      '<h2 data-rw-vt="title-1" data-rw-vt-for="*">Keyboard</h2>' +
      "</section>",
  );
});

Deno.test("ViewTransitions emits @view-transition style, optional nonce/types, and render-blocking expect links", async () => {
  const markup = await renderToString(
    <ViewTransitions nonce="n123" types={["slide", "fade"]} expect={["#hero", "title"]} />,
  );

  assertEquals(
    markup,
    '<style nonce="n123">@view-transition{navigation:auto;types:slide fade}</style>' +
      '<link rel="expect" blocking="render" href="#hero">' +
      '<link rel="expect" blocking="render" href="#title">',
  );
});

Deno.test("ViewTransition helpers reject invalid CSS idents, reserved names, and malformed targets", () => {
  for (const bad of ["", "none", "AUTO", "123", "hero;color:red", "two words"]) {
    assertThrows(() => vt(bad), TypeError);
  }
  assertThrows(() => vt("hero", { share: "none" }), TypeError);
  assertThrows(() => vt("hero", { share: "bad;x:1" }), TypeError);
  assertThrows(() => vt("hero", { for: "relative/path" }), TypeError);
  assertThrows(() => vt("hero", { for: [] }), TypeError);
  assertThrows(() => ViewTransitions({ types: ["bad type"] }), TypeError);
  assertThrows(() => ViewTransitions({ expect: "has space" }), TypeError);
});
