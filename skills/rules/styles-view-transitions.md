---
title: Use View Transitions with Stable Names
impact: HIGH
impactDescription: Produces smoother page/state swaps with less custom animation code.
tags: ruwuter, styling, view-transitions, css
---

## Use View Transitions with Stable Names

Use View Transitions API when swapping in server-returned HTML for route/content updates.

**Preferred pattern:**

```css
[data-vt="card"] {
  view-transition-name: card;
}

::view-transition-old(card),
::view-transition-new(card) {
  animation-duration: 180ms;
  animation-timing-function: ease-out;
}
```

```ts
async function swapFromServer(url: string) {
  const nextHtml = await fetch(url, { headers: { "x-rw-fragment": "1" } }).then((r) => r.text());
  document.getElementById("app-root")!.innerHTML = nextHtml;
}

if ("startViewTransition" in document) {
  await (document as Document & {
    startViewTransition: (fn: () => void | Promise<void>) => { finished: Promise<void> };
  }).startViewTransition(async () => {
    await swapFromServer("/projects/42");
  }).finished;
} else {
  await swapFromServer("/projects/42");
}
```
