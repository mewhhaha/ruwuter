import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "./js.ts";
import { generateControllers, GENERATED_CONTROLLERS_MARKER } from "./generate-controllers.ts";
import { assertInsideGeneratedTypesRoot, generatedTypesRoot } from "./paths.ts";
import type { GenerateResult } from "./types.ts";

export { generatedTypesRoot } from "./paths.ts";

export const writeGeneratedFiles = async (
  appFolder: string,
  options: { controllers?: boolean } = {},
): Promise<GenerateResult> => {
  const generated = await generate(appFolder);
  if (options.controllers) generated.controllers = await generateControllers(appFolder);
  const controllersPath = path.resolve(appFolder, "controllers.ts");
  if (options.controllers) {
    const existing = await readFile(controllersPath, "utf8").catch(() => undefined);
    const isGenerated = existing?.startsWith(GENERATED_CONTROLLERS_MARKER) ?? false;
    if (generated.controllers.length && existing && !isGenerated) {
      throw new Error(`Refusing to overwrite user-owned controller file: ${controllersPath}`);
    }
    if (!generated.controllers.length && isGenerated) await rm(controllersPath, { force: true });
  }
  const files = [...generated.router, ...generated.types, ...generated.controllers];
  const typesRoot = generatedTypesRoot(appFolder);

  assertInsideGeneratedTypesRoot(typesRoot);
  await rm(typesRoot, { recursive: true, force: true });

  await Promise.all(
    files.map(async ({ path: outputPath, contents }) => {
      const absolutePath = path.resolve(outputPath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  return generated;
};
