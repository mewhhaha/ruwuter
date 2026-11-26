const root = new URL("../../", import.meta.url);
const dist = "examples/cloudflare/dist";

await Deno.mkdir(new URL(`${dist}/server`, root), { recursive: true });
await Deno.mkdir(new URL(`${dist}/assets`, root), { recursive: true });

const browserFlags = ["--platform=browser", "--minify"];
const bundles = [
  {
    entry: "examples/cloudflare/worker.ts",
    output: "server/worker.mjs",
    flags: ["--platform=deno", "--external=node:async_hooks"],
  },
  { entry: "src/runtime/client.ts", output: "assets/client.js", flags: browserFlags },
  { entry: "src/runtime/vt.ts", output: "assets/vt.js", flags: browserFlags },
  { entry: "examples/fx.client.ts", output: "assets/fx.client.js", flags: browserFlags },
];

for (const { entry, output, flags } of bundles) {
  const { code, success } = await new Deno.Command(Deno.execPath(), {
    args: ["bundle", ...flags, entry, "-o", `${dist}/${output}`],
    cwd: root,
  }).spawn().status;
  if (!success) Deno.exit(code);
}
