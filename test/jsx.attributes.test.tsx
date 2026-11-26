import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";

describe("JSX attribute typing", () => {
  it("accepts recently added global attributes", () => {
    const node = (
      <div
        anchor="hero"
        autocapitalize="words"
        autocorrect="off"
        data-state="open"
        enterkeyhint="done"
        exportparts="chip label"
        hidden="until-found"
        inputmode="numeric"
        nonce="abc123"
        part="chip"
        slot="actions"
        virtualkeyboardpolicy="manual"
        writingsuggestions="true"
      >
        hi
      </div>
    );

    expect(node != null).toBe(true);
  });

  it("accepts newer dialog, popover, and fetch-related attributes", () => {
    const node = (
      <dialog closedby="closerequest">
        <button
          command="request-close"
          commandfor="confirm-dialog"
          popovertarget="menu"
          popovertargetaction="toggle"
          type="button"
        >
          Close
        </button>
        <img
          alt=""
          fetchpriority="high"
          referrerpolicy="strict-origin-when-cross-origin"
          src="/hero.png"
        />
        <iframe credentialless csp="script-src 'none'" referrerpolicy="origin" src="/embed" />
        <link
          blocking="render"
          fetchpriority="low"
          href="/hero.png"
          imagesizes="100vw"
          imagesrcset="/hero.png 1x"
          rel="preload"
        />
        <script blocking="render" fetchpriority="low" nomodule referrerpolicy="same-origin" />
      </dialog>
    );

    expect(node != null).toBe(true);
  });

  it("formats Date attributes, http-equiv meta tags, and standard boolean HTML attributes", async () => {
    const date = new Date("2026-01-02T03:04:05.000Z");
    const html = await (
      <div>
        <meta http-equiv="refresh" content="5" />
        <time datetime={date}>Jan 2</time>
        <fieldset disabled>
          <select disabled multiple required>
            <optgroup disabled label="Group">
              <option disabled selected value="a">A</option>
            </optgroup>
          </select>
          <textarea disabled />
        </fieldset>
        <ol reversed />
        <video autoplay controls loop />
        <audio autoplay controls loop />
        <picture />
        <search />
        <slot />
      </div>
    ).toPromise();

    expect(html).toContain('<meta http-equiv="refresh" content="5">');
    expect(html).toContain('<time datetime="2026-01-02T03:04:05.000Z">Jan 2</time>');
    expect(html).toContain('<fieldset disabled="">');
    expect(html).toContain('<select disabled="" multiple="" required="">');
    expect(html).toContain('<option disabled="" selected="" value="a">');
    expect(html).toContain('<ol reversed="">');
    expect(html).toContain('<video autoplay="" controls="" loop="">');
  });

  it("types fx-* hypermedia attributes and common SVG elements", async () => {
    const html = await (
      <div>
        <button
          type="button"
          fx-action="/reviews/1"
          fx-method="DELETE"
          fx-target="closest li"
          fx-swap="remove"
          fx-trigger="click"
          fx-debounce={150}
        >
          Delete
        </button>
        <svg viewBox="0 0 24 24" width={24} height={24}>
          <defs>
            <linearGradient id="g">
              <stop offset="0%" stop-color="#007c69" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="currentColor" stroke-width={2}>
            <rect x={2} y={2} width={20} height={20} rx={4} />
            <circle cx={12} cy={12} r={5} />
            <line x1={0} y1={0} x2={24} y2={24} />
            <text x={12} y={12} text-anchor="middle">ok</text>
          </g>
        </svg>
      </div>
    ).toPromise();

    expect(html).toContain('fx-action="/reviews/1"');
    expect(html).toContain('fx-method="DELETE"');
    expect(html).toContain('fx-debounce="150"');
    expect(html).toContain('<circle cx="12" cy="12" r="5"></circle>');
  });
});
