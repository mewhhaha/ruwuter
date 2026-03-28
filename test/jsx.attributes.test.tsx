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
});
