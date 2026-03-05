---
title: Prefer Declarative Dialog Commands
impact: HIGH
impactDescription: Replaces boilerplate open/close JS with built-in browser behavior.
tags: ruwuter, dialog, command, commandfor
---

## Prefer Declarative Dialog Commands

Use button commands with a target dialog before writing imperative show/close handlers.

**Preferred pattern:**

```html
<dialog id="delete-dialog">
  <p>Delete this item?</p>
  <button command="close" commandfor="delete-dialog">Cancel</button>
  <button command="request-close" commandfor="delete-dialog">Delete</button>
</dialog>

<button command="show-modal" commandfor="delete-dialog">Open dialog</button>
```

Use imperative `showModal()` only when control flow cannot be expressed declaratively.
