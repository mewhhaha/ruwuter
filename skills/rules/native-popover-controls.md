---
title: Use Native Popover Controls Before Custom Toggle JS
impact: HIGH
impactDescription: Handles common open/close interaction patterns declaratively.
tags: ruwuter, popover, native, interaction
---

## Use Native Popover Controls Before Custom Toggle JS

Prefer popover attributes for menus/overlays that do not need full modal behavior.

**Preferred pattern:**

```html
<button popovertarget="user-menu" popovertargetaction="toggle">Menu</button>

<div id="user-menu" popover>
  <a href="/profile">Profile</a>
  <a href="/logout">Log out</a>
</div>
```

Use custom JavaScript only for behavior not covered by native popover actions.
