import { viewTransitionsApp } from "../view-transitions.tsx";

const app = viewTransitionsApp({
  assets: {
    clientRuntime: "/client.js",
    vtRuntime: "/vt.js",
    fxController: "/fx.client.js",
  },
});

export default { fetch: app.fetch };
