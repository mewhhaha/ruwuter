import { expect, it } from "vitest";
import { renderToString } from "../src/router.ts";
import { ViewTransition, ViewTransitions, vt } from "../src/components/index.ts";

it("ViewTransition and vt() emit zero-JS inline styles by default and merge caller styles", async () => {
  const markup = await renderToString(
    <ViewTransition as="article" name="product-42" share="hero card" class="box" style="color:red">
      <img src="/a.png" alt="A" {...vt("art-42", { share: "hero-art" })} />
    </ViewTransition>,
  );

  expect(markup).toBe(
    '<article class="box" style="view-transition-name:product-42;view-transition-class:hero card;color:red">' +
      '<img src="/a.png" alt="A" style="view-transition-name:art-42;view-transition-class:hero-art">' +
      "</article>",
  );
});

it("ViewTransition and vt() emit scoped data-rw-vt attributes when `for` is provided", async () => {
  const markup = await renderToString(
    <ViewTransition as="section" name="card-1" for={["/items/1", "/items/1/reviews"]} share="hero">
      <h2 {...vt("title-1", { for: "*" })}>Keyboard</h2>
    </ViewTransition>,
  );

  expect(markup).toBe(
    '<section data-rw-vt="card-1" data-rw-vt-for="/items/1 /items/1/reviews" data-rw-vt-class="hero">' +
      '<h2 data-rw-vt="title-1" data-rw-vt-for="*">Keyboard</h2>' +
      "</section>",
  );
});

it("ViewTransitions emits @view-transition style, optional nonce/types, and render-blocking expect links", async () => {
  const markup = await renderToString(
    <ViewTransitions nonce="n123" types={["slide", "fade"]} expect={["#hero", "title"]} />,
  );

  expect(markup).toBe(
    '<style nonce="n123">@view-transition{navigation:auto;types:slide fade}</style>' +
      '<link rel="expect" blocking="render" href="#hero">' +
      '<link rel="expect" blocking="render" href="#title">',
  );
});

it("ViewTransition helpers reject invalid CSS idents, reserved names, and malformed targets", () => {
  for (const bad of ["", "none", "AUTO", "123", "hero;color:red", "two words"]) {
    expect(() => vt(bad)).toThrow(TypeError);
  }
  expect(() => vt("hero", { share: "none" })).toThrow(TypeError);
  expect(() => vt("hero", { share: "bad;x:1" })).toThrow(TypeError);
  expect(() => vt("hero", { for: "relative/path" })).toThrow(TypeError);
  expect(() => vt("hero", { for: [] })).toThrow(TypeError);
  expect(() => ViewTransitions({ types: ["bad type"] })).toThrow(TypeError);
  expect(() => ViewTransitions({ expect: "has space" })).toThrow(TypeError);
});
