import { join, resolve } from "node:path";
import { expect, it } from "../test-support/deno_vitest_shim.ts";
import { generatedTypesRoot } from "../src/fs-routes/write.ts";

it("runs the file-route CLI with Deno", async () => {
  const app = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(app, "routes"));
    await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
    await Deno.writeTextFile(join(app, "routes", "index.ts"), "export default 1;");

    const result = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", resolve("src/fs-routes/routes.ts"), app],
      stderr: "piped",
    }).output();

    expect(result.success).toBe(true);
    expect(await Deno.readTextFile(join(app, "routes.ts"))).toContain(
      'import * as $index from "./routes/index.ts";',
    );
  } finally {
    await Deno.remove(app, { recursive: true });
    await Deno.remove(generatedTypesRoot(app), { recursive: true }).catch(() => {});
  }
});
