import { controller } from "@mewhhaha/ruwuter/browser";
import { Deferred, ViewTransition, ViewTransitions, vt } from "../src/components/index.ts";
import { html, type JSX, router, unsafeHTML } from "../src/router.ts";

export interface CatalogItem {
  slug: string;
  name: string;
  tagline: string;
  price: string;
  category: string;
  accent: string;
  tint: string;
  specs: readonly string[];
  stockDelayMs?: number;
  reviewsDelayMs?: number;
}

export interface ItemReview {
  id: string;
  author: string;
  text: string;
}

export interface ShowcaseAssets {
  clientRuntime: string;
  vtRuntime: string;
  fxController: string;
}

export interface ShowcaseOptions {
  assets: ShowcaseAssets;
  items?: readonly CatalogItem[];
  simulateLatency?: boolean;
}

export const DEFAULT_ITEMS: readonly CatalogItem[] = [
  {
    slug: "split-65",
    name: "Split 65",
    tagline: "Column-staggered mechanical keyboard with hotswap switches.",
    price: "$240",
    category: "Keyboards",
    accent: "#007c69",
    tint: "#e6f4f1",
    specs: ["Aluminum unibody", "USB-C + Bluetooth", "QMK / Vial firmware"],
    stockDelayMs: 140,
    reviewsDelayMs: 380,
  },
  {
    slug: "studio-dac",
    name: "Studio DAC",
    tagline: "Balanced desktop headphone amplifier with stepped attenuator.",
    price: "$310",
    category: "Audio",
    accent: "#2d5a8c",
    tint: "#e8eff7",
    specs: ["Dual mono DAC", "4.4mm + 6.35mm out", "Zero-latency USB"],
    stockDelayMs: 160,
    reviewsDelayMs: 420,
  },
  {
    slug: "task-lamp",
    name: "Arc Task Lamp",
    tagline: "High-CRI warm-to-cool desk lamp with rotary brass dimmer.",
    price: "$165",
    category: "Lighting",
    accent: "#b55d1c",
    tint: "#faeee4",
    specs: ["97 CRI LED array", "2700K–5000K", "Weighted steel base"],
    stockDelayMs: 120,
    reviewsDelayMs: 350,
  },
  {
    slug: "track-dial",
    name: "Track Dial",
    tagline: "Machined aluminum jog wheel and programmable macro pad.",
    price: "$129",
    category: "Input",
    accent: "#6d3f8f",
    tint: "#f2eaf8",
    specs: ["Magnetic hall encoder", "4 tactile keys", "Haptic detents"],
    stockDelayMs: 150,
    reviewsDelayMs: 400,
  },
];

const SHOWCASE_CSS = `
:root {
  color-scheme: light;
  --ink: #152534;
  --muted: #526578;
  --line: #d8e1e8;
  --surface: #ffffff;
  --bg: #f6f8fa;
  --brand: #007c69;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--bg);
  line-height: 1.5;
}
.shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1.25rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--line);
}
.brand {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--ink);
  text-decoration: none;
  letter-spacing: -0.02em;
}
.pill {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--brand);
  background: #e6f4f1;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
}
.hero-intro h1 {
  margin: 0 0 0.4rem;
  font-size: clamp(1.75rem, 3.5vw, 2.35rem);
  letter-spacing: -0.03em;
}
.hero-intro p {
  margin: 0 0 1.25rem;
  color: var(--muted);
  max-width: 62ch;
}
.search-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.search-bar input {
  flex: 1;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  font: inherit;
}
.btn {
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.btn-ghost {
  padding: 0.3rem 0.6rem;
  font-size: 0.82rem;
  color: var(--muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(21, 37, 52, 0.08);
}
.card-art {
  aspect-ratio: 16 / 10;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.card-body {
  padding: 0.9rem 1rem 1.05rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--muted);
}
.card h2 {
  margin: 0;
  font-size: 1.08rem;
  letter-spacing: -0.015em;
}
.card p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 1.25rem;
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.detail-hero {
  display: grid;
  grid-template-columns: minmax(240px, 1.15fr) 1fr;
  gap: 1.75rem;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
@media (max-width: 720px) {
  .detail-hero { grid-template-columns: 1fr; }
}
.detail-art {
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  display: grid;
  place-items: center;
  padding: 1.25rem;
}
.detail-title {
  margin: 0.25rem 0 0.5rem;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  letter-spacing: -0.03em;
}
.price {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--brand);
  margin: 0.25rem 0 0.75rem;
}
.specs {
  margin: 0.75rem 0 0;
  padding-left: 1.15rem;
  color: var(--muted);
}
.panels {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 1.25rem;
}
@media (max-width: 720px) {
  .panels { grid-template-columns: 1fr; }
}
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.15rem 1.25rem;
}
.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}
.reveal {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 220ms ease, transform 220ms ease;
}
@starting-style {
  .reveal {
    opacity: 0;
    transform: translateY(6px);
  }
}
.review-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.review-form input {
  flex: 1;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  font: inherit;
}
.error {
  color: #b42318;
  font-size: 0.88rem;
  margin-bottom: 0.5rem;
}
.reviews {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.reviews li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
}
[aria-busy="true"] {
  opacity: 0.65;
}

/* Shared-element MPA + same-document View Transition styling */
::view-transition-group(.hero-art),
::view-transition-group(.hero-title) {
  animation-duration: 300ms;
  animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
}
html:active-view-transition-type(back)::view-transition-old(root) {
  animation: vt-fade-out 180ms ease;
}
html:active-view-transition-type(review-add)::view-transition-new(root),
html:active-view-transition-type(filter)::view-transition-new(root) {
  animation: vt-fade-in 180ms ease;
}
@keyframes vt-fade-out { from { opacity: 1; } to { opacity: 0.85; } }
@keyframes vt-fade-in { from { opacity: 0.75; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.01ms !important;
  }
}
`;

function ItemArtwork({ item }: { item: CatalogItem }) {
  return (
    <svg viewBox="0 0 220 120" width={220} height={120} aria-hidden="true">
      <rect x={16} y={18} width={188} height={84} rx={14} fill={item.accent} opacity={0.14} />
      <rect x={28} y={30} width={164} height={60} rx={10} fill={item.accent} />
      <circle cx={62} cy={60} r={14} fill="#ffffff" opacity={0.92} />
      <rect x={88} y={48} width={86} height={10} rx={5} fill="#ffffff" opacity={0.9} />
      <rect x={88} y={66} width={58} height={8} rx={4} fill="#ffffff" opacity={0.65} />
    </svg>
  );
}

function CatalogCards({ items }: { items: readonly CatalogItem[] }) {
  if (items.length === 0) {
    return <p>No gear matches that search.</p>;
  }
  return (
    <>
      {items.map((item) => (
        <a class="card" href={`/items/${item.slug}`}>
          <ViewTransition
            as="div"
            name={`art-${item.slug}`}
            for={`/items/${item.slug}`}
            share="hero-art"
            class="card-art"
            style={`background:${item.tint}`}
          >
            <ItemArtwork item={item} />
          </ViewTransition>
          <div class="card-body">
            <div class="card-meta">
              <span>{item.category}</span>
              <strong>{item.price}</strong>
            </div>
            <h2
              {...vt(`title-${item.slug}`, {
                for: `/items/${item.slug}`,
                share: "hero-title",
              })}
            >
              {item.name}
            </h2>
            <p>{item.tagline}</p>
          </div>
        </a>
      ))}
    </>
  );
}

function ReviewRow({ slug, review }: { slug: string; review: ItemReview }) {
  return (
    <li data-review-id={review.id}>
      <span>
        <strong>{review.author}:</strong> {review.text}
      </span>
      <button
        type="button"
        class="btn btn-ghost"
        fx-action={`/items/${slug}/reviews/${review.id}`}
        fx-method="DELETE"
        fx-target="closest li"
        fx-swap="remove"
        fx-transition="review-remove"
      >
        Remove
      </button>
    </li>
  );
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const isFxRequest = (request: Request): boolean => request.headers.get("FX-Request") === "true";

/**
 * Full-stack Ruwuter showcase combining:
 * - React-inspired `<ViewTransition>` / `vt()` + `<ViewTransitions>` + `vt.js` MPA hero morphing
 * - Out-of-order streaming `<Deferred>` panels below the hero fold
 * - Fixi-style progressive partial updates (`examples/fx.client.ts`) with typed View Transitions
 */
export function viewTransitionsApp(options: ShowcaseOptions) {
  const items = options.items ?? DEFAULT_ITEMS;
  const simulate = options.simulateLatency ?? true;
  const { assets } = options;
  const fx = controller(assets.fxController);

  let nextId = 100;
  const reviewsBySlug = new Map<string, ItemReview[]>(
    items.map((item) => [
      item.slug,
      [{ id: `seed-${item.slug}`, author: "Alex", text: `Daily driver ${item.name}—zero issues.` }],
    ]),
  );

  const findItem = (slug: string) => items.find((item) => item.slug === slug);
  const filterItems = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  };

  function Document({
    title,
    expect,
    children,
  }: {
    title: string;
    expect?: string;
    children?: JSX.HtmlNode;
  }) {
    return (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          <ViewTransitions expect={expect} />
          <style>{unsafeHTML(SHOWCASE_CSS)}</style>
          <script type="module" blocking="render" src={assets.vtRuntime}></script>
        </head>
        <body>
          <div class="shell" {...fx.root()}>
            <header class="topbar">
              <a class="brand" href="/">
                Ruwuter Desk Gear
              </a>
              <span class="pill">MPA View Transitions + Streaming HTML</span>
            </header>
            {children}
          </div>
          <script type="module" async src={assets.clientRuntime}></script>
        </body>
      </html>
    );
  }

  return router()
    .get("/", ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") ?? "";
      const matched = filterItems(q);
      return html(
        <Document title="Ruwuter Desk Gear — MPA View Transitions">
          <section class="hero-intro">
            <h1>Streaming HTML with native MPA View Transitions</h1>
            <p>
              Click any item for a cross-document shared-element hero morph powered by{" "}
              <code>&lt;ViewTransition&gt;</code> and <code>vt.js</code>, while stock and reviews
              stream independently via <code>&lt;Deferred&gt;</code>.
            </p>
          </section>

          <form class="search-bar" method="get" action="/">
            <input
              type="search"
              name="q"
              value={q}
              placeholder="Filter gear (live swap with typed view transition)..."
              aria-label="Filter gear"
              fx-action="/items"
              fx-trigger="input"
              fx-debounce="80"
              fx-target="#catalog"
              fx-swap="innerHTML"
              fx-transition="filter"
            />
            <button type="submit" class="btn">
              Filter
            </button>
          </form>

          <section id="catalog" class="grid">
            <CatalogCards items={matched} />
          </section>
        </Document>,
      );
    })
    .get("/items", ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") ?? "";
      return html(<CatalogCards items={filterItems(q)} />);
    })
    .get("/items/:slug", ({ params, signal }) => {
      const item = findItem(params.slug);
      if (!item) return new Response("Not found", { status: 404 });

      return html(
        <Document title={`${item.name} — Ruwuter Desk Gear`} expect="#item-hero">
          <a class="back-link" href="/">
            ← All gear
          </a>

          <article id="item-hero" class="detail-hero">
            <ViewTransition
              as="div"
              name={`art-${item.slug}`}
              for="*"
              share="hero-art"
              class="detail-art"
              style={`background:${item.tint}`}
            >
              <ItemArtwork item={item} />
            </ViewTransition>

            <div>
              <span class="pill">{item.category}</span>
              <h1
                class="detail-title"
                {...vt(`title-${item.slug}`, { for: "*", share: "hero-title" })}
              >
                {item.name}
              </h1>
              <div class="price">{item.price}</div>
              <p>{item.tagline}</p>
              <ul class="specs">
                {
                  // deno-lint-ignore jsx-key -- static specs list
                  item.specs.map((spec) => (
                    <li>{spec}</li>
                  ))
                }
              </ul>
            </div>
          </article>

          <section class="panels">
            <div class="panel">
              <h2>Availability</h2>
              <Deferred fallback={<p id="stock-wait">Checking warehouse stock...</p>}>
                {async () => {
                  if (simulate) await sleep(item.stockDelayMs ?? 140, signal);
                  return (
                    <div id="stock-ready" class="reveal">
                      <p>
                        <strong>In stock</strong> — ships within 24 hours from nearest edge hub.
                      </p>
                    </div>
                  );
                }}
              </Deferred>
            </div>

            <div class="panel">
              <h2>Community reviews</h2>
              <form
                id="review-form"
                class="review-form"
                method="post"
                action={`/items/${item.slug}/reviews`}
                fx-target="#reviews"
                fx-swap="beforeend"
                fx-error-target="#review-error"
                fx-reset=""
                fx-transition="review-add"
              >
                <input name="review" placeholder="Add a quick note..." aria-label="Review" />
                <button type="submit" class="btn btn-primary">
                  Post
                </button>
              </form>
              <div id="review-error" class="error" role="alert"></div>

              <Deferred fallback={<p id="reviews-wait">Streaming reviews...</p>}>
                {async () => {
                  if (simulate) await sleep(item.reviewsDelayMs ?? 380, signal);
                  const list = reviewsBySlug.get(item.slug) ?? [];
                  return (
                    <ul id="reviews" class="reviews reveal">
                      {
                        // deno-lint-ignore jsx-key -- server-rendered list
                        list.map((review) => (
                          <ReviewRow slug={item.slug} review={review} />
                        ))
                      }
                    </ul>
                  );
                }}
              </Deferred>
            </div>
          </section>
        </Document>,
      );
    })
    .post("/items/:slug/reviews", async ({ params, request }) => {
      const item = findItem(params.slug);
      if (!item) return new Response(null, { status: 404 });
      const text = String((await request.formData()).get("review") ?? "").trim();
      if (!text) {
        if (isFxRequest(request)) {
          return html(<p>Please write a review before posting.</p>, { status: 422 });
        }
        return new Response("Review is required", { status: 400 });
      }
      const review: ItemReview = { id: String(nextId++), author: "Guest", text };
      const list = reviewsBySlug.get(item.slug) ?? [];
      list.push(review);
      reviewsBySlug.set(item.slug, list);

      if (isFxRequest(request)) {
        return html(<ReviewRow slug={item.slug} review={review} />, { status: 201 });
      }
      return Response.redirect(new URL(`/items/${item.slug}`, request.url), 303);
    })
    .route("/items/:slug/reviews/:reviewId", {
      DELETE: ({ params }) => {
        const list = reviewsBySlug.get(params.slug);
        if (!list) return new Response(null, { status: 404 });
        const index = list.findIndex((r) => r.id === params.reviewId);
        if (index === -1) return new Response(null, { status: 404 });
        list.splice(index, 1);
        return html("");
      },
    });
}
