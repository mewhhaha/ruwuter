const entries = [
  { name: "client.js", path: "src/runtime/client.ts", budget: 1_400 },
  { name: "resolve.js", path: "src/runtime/resolve.ts", budget: 500 },
  { name: "swap.js", path: "src/runtime/swap.ts", budget: 1_450 },
  { name: "navigate.js", path: "src/runtime/navigate.ts", budget: 1_500 },
] as const;

const gzipSize = async (bytes: Uint8Array): Promise<number> => {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const writer = new Blob([buffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(writer).arrayBuffer()).byteLength;
};

let overBudget = false;

for (const entry of entries) {
  const command = new Deno.Command("deno", {
    args: ["bundle", "--platform=browser", "--minify", "--quiet", entry.path],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    await Deno.stderr.write(output.stderr);
    throw new Error(`Could not bundle ${entry.name}.`);
  }

  const size = await gzipSize(output.stdout);
  const status = size <= entry.budget ? "ok" : "OVER";
  console.log(
    `${entry.name.padEnd(12)} ${String(size).padStart(5)} B gzip / ${entry.budget} B (${status})`,
  );
  overBudget ||= size > entry.budget;
}

if (overBudget) {
  console.error("Browser runtime size budget exceeded.");
  Deno.exit(1);
}
