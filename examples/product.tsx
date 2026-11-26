import { html, router } from "../src/router.ts";

export interface Products {
  name(id: string, signal: AbortSignal): Promise<string | undefined>;
  reviews(id: string, signal: AbortSignal): Promise<string[]>;
  addReview(id: string, text: string, signal: AbortSignal): Promise<void>;
}

export function productApp(products: Products) {
  async function Reviews({ id, signal }: { id: string; signal: AbortSignal }) {
    const reviews = await products.reviews(id, signal);
    // deno-lint-ignore jsx-key -- server-rendered list without DOM reconciliation
    return (
      <ul>
        {reviews.map((text) => (
          <li>{text}</li>
        ))}
      </ul>
    );
  }

  return router()
    .get("/products/:id", async ({ params, signal }) => {
      const name = await products.name(params.id, signal);
      if (!name) return new Response(null, { status: 404 });
      return html(
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>{name}</title>
          </head>
          <body>
            <h1>{name}</h1>
            <form method="post" action={`/products/${params.id}/reviews`}>
              <label>
                Review <input name="review" required />
              </label>
              <button type="submit">Save review</button>
            </form>
            <Reviews id={params.id} signal={signal} />
          </body>
        </html>,
      );
    })
    .post("/products/:id/reviews", async ({ params, request, signal }) => {
      if (!(await products.name(params.id, signal))) return new Response(null, { status: 404 });
      const text = (await request.formData()).get("review");
      if (typeof text !== "string" || !text.trim()) return new Response(null, { status: 400 });
      await products.addReview(params.id, text.trim(), signal);
      return Response.redirect(new URL(`/products/${params.id}`, request.url), 303);
    });
}
