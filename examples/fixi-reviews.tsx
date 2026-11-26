import { controller } from "@mewhhaha/ruwuter/browser";
import { Deferred } from "../src/components/index.ts";
import { html, router } from "../src/router.ts";

export interface Review {
  id: string;
  text: string;
}

export interface ReviewStore {
  productName(id: string, signal: AbortSignal): Promise<string | undefined>;
  listReviews(id: string, query: string, signal: AbortSignal): Promise<Review[]>;
  addReview(id: string, text: string, signal: AbortSignal): Promise<Review>;
  deleteReview(id: string, reviewId: string, signal: AbortSignal): Promise<boolean>;
  summary(id: string, signal: AbortSignal): Promise<string>;
}

export interface FixiAssets {
  clientRuntime: string;
  fxController: string;
}

const isFxRequest = (request: Request): boolean => request.headers.get("FX-Request") === "true";

function ReviewItem({ productId, review }: { productId: string; review: Review }) {
  return (
    <li data-review-id={review.id}>
      <span>{review.text}</span>{" "}
      <button
        type="button"
        fx-action={`/products/${productId}/reviews/${review.id}`}
        fx-method="DELETE"
        fx-target="closest li"
        fx-swap="remove"
      >
        Delete
      </button>
    </li>
  );
}

function ReviewList({ productId, reviews }: { productId: string; reviews: Review[] }) {
  return (
    <>
      {
        // deno-lint-ignore jsx-key -- server-rendered list without DOM reconciliation
        reviews.map((review) => (
          <ReviewItem productId={productId} review={review} />
        ))
      }
    </>
  );
}

/**
 * Progressive-enhancement product reviews app using `examples/fx.client.ts`.
 *
 * - Without JS: native `<form method="post">` + `303` redirect and native `<form method="get">`
 *   search continue to work with zero scripts.
 * - With JS: `FX-Request: true` enables in-place review appends (`201`), inline validation errors
 *   (`422`), RESTful `DELETE` buttons, debounced live search with abort, and `<Deferred>` partial
 *   swaps via `swap()`.
 */
export function fixiReviewsApp(store: ReviewStore, assets: FixiAssets) {
  const fx = controller(assets.fxController);

  return router()
    .get("/products/:id", async ({ params, request, signal }) => {
      const name = await store.productName(params.id, signal);
      if (!name) return new Response(null, { status: 404 });
      const query = new URL(request.url).searchParams.get("q") ?? "";
      const reviews = await store.listReviews(params.id, query, signal);

      return html(
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>{name}</title>
          </head>
          <body>
            <main {...fx.root()}>
              <h1>{name}</h1>

              <form id="search-form" method="get" action={`/products/${params.id}`}>
                <label>
                  Filter reviews{" "}
                  <input
                    type="search"
                    name="q"
                    value={query}
                    fx-action={`/products/${params.id}/reviews`}
                    fx-trigger="input"
                    fx-debounce="60"
                    fx-target="#reviews"
                    fx-swap="innerHTML"
                  />
                </label>
                <button type="submit">Filter</button>
              </form>

              <form
                id="review-form"
                method="post"
                action={`/products/${params.id}/reviews`}
                fx-target="#reviews"
                fx-swap="beforeend"
                fx-error-target="#review-error"
                fx-reset=""
              >
                <label>
                  Review <input name="review" />
                </label>
                <button type="submit">Save review</button>
              </form>
              <div id="review-error" role="alert"></div>

              <ul id="reviews">
                <ReviewList productId={params.id} reviews={reviews} />
              </ul>

              <section id="summary">
                <button
                  type="button"
                  fx-action={`/products/${params.id}/summary`}
                  fx-target="#summary"
                  fx-swap="innerHTML"
                >
                  Load review summary
                </button>
              </section>
            </main>
            <script type="module" async src={assets.clientRuntime}></script>
          </body>
        </html>,
      );
    })
    .route("/products/:id/reviews", {
      GET: async ({ params, request, signal }) => {
        if (!(await store.productName(params.id, signal))) {
          return new Response(null, { status: 404 });
        }
        const query = new URL(request.url).searchParams.get("q") ?? "";
        const reviews = await store.listReviews(params.id, query, signal);
        return html(<ReviewList productId={params.id} reviews={reviews} />);
      },
      POST: async ({ params, request, signal }) => {
        if (!(await store.productName(params.id, signal))) {
          return new Response(null, { status: 404 });
        }
        const text = String((await request.formData()).get("review") ?? "").trim();
        if (!text) {
          if (isFxRequest(request)) {
            return html(<p>Please write a review before submitting.</p>, { status: 422 });
          }
          return new Response(null, { status: 400 });
        }
        const review = await store.addReview(params.id, text, signal);
        if (isFxRequest(request)) {
          return html(<ReviewItem productId={params.id} review={review} />, { status: 201 });
        }
        return Response.redirect(new URL(`/products/${params.id}`, request.url), 303);
      },
    })
    .route("/products/:id/reviews/:reviewId", {
      DELETE: async ({ params, signal }) => {
        const deleted = await store.deleteReview(params.id, params.reviewId, signal);
        if (!deleted) return new Response(null, { status: 404 });
        return html("");
      },
    })
    .get("/products/:id/summary", async ({ params, signal }) => {
      if (!(await store.productName(params.id, signal))) {
        return new Response(null, { status: 404 });
      }
      return html(
        <Deferred fallback={<p>Loading summary...</p>}>
          {async () => <p id="summary-ready">{await store.summary(params.id, signal)}</p>}
        </Deferred>,
      );
    });
}
