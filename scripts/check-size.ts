import { gzipSync } from "node:zlib";
import { rolldown } from "rolldown";

const entries = [
  { name: "client.js", path: "src/runtime/client.ts", budget: 1_400 },
  { name: "resolve.js", path: "src/runtime/resolve.ts", budget: 500 },
  { name: "swap.js", path: "src/runtime/swap.ts", budget: 1_650 },
  { name: "vt.js", path: "src/runtime/vt.ts", budget: 750 },
] as const;

let overBudget = false;

for (const entry of entries) {
  const bundle = await rolldown({
    input: entry.path,
    platform: "browser",
  });
  const { output } = await bundle.generate({
    format: "es",
    minify: true,
  });
  await bundle.close();

  const size = gzipSync(Buffer.from(output[0].code)).byteLength;
  const status = size <= entry.budget ? "ok" : "OVER";
  console.log(
    `${entry.name.padEnd(12)} ${String(size).padStart(5)} B gzip / ${entry.budget} B (${status})`,
  );
  overBudget ||= size > entry.budget;
}

if (overBudget) {
  console.error("Browser runtime size budget exceeded.");
  process.exit(1);
}
