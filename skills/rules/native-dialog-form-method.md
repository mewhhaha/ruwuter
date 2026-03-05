---
title: Use method="dialog" for Modal Outcome Flows
impact: HIGH
impactDescription: Simplifies confirm/cancel handling and keeps dialog close semantics native.
tags: ruwuter, dialog, forms, native
---

## Use method="dialog" for Modal Outcome Flows

For confirm/cancel inside dialogs, use `method="dialog"` to close with a form result.

**Preferred pattern:**

```html
<dialog id="invite-dialog">
  <form method="dialog">
    <p>Send invitation?</p>
    <button value="cancel">Cancel</button>
    <button value="confirm">Send</button>
  </form>
</dialog>
```

Read `dialog.returnValue` after close when branching on result.
