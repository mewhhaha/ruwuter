import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { generatedTypesRoot } from "../src/fs-routes/write.ts";

const execFileAsync = promisify(execFile);

it("runs the file-route CLI with Node", async () => {
  const app = await mkdtemp(join(tmpdir(), "ruwuter-cli-"));
  try {
    await mkdir(join(app, "routes"));
    await writeFile(join(app, "document.tsx"), "export default 1;");
    await writeFile(join(app, "routes", "index.ts"), "export default 1;");

    await execFileAsync(process.execPath, [resolve("src/fs-routes/routes.ts"), app]);

    expect(await readFile(join(app, "routes.ts"), "utf8")).toContain(
      'import * as $index from "./routes/index.ts";',
    );

    await rm(join(app, "routes.ts"));
    await execFileAsync(process.execPath, [resolve("lib/fs-routes-cli.js"), app]);

    expect(await readFile(join(app, "routes.ts"), "utf8")).toContain(
      'import * as $index from "./routes/index.ts";',
    );
  } finally {
    await rm(app, { recursive: true, force: true });
    await rm(generatedTypesRoot(app), { recursive: true, force: true }).catch(() => {});
  }
});
