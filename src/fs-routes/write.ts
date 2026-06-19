import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "./js.ts";
import { assertInsideGeneratedTypesRoot, generatedTypesRoot } from "./paths.ts";
import type { GenerateResult } from "./types.ts";

export { generatedTypesRoot } from "./paths.ts";

export const writeGeneratedFiles = async (
  appFolder: string,
): Promise<GenerateResult> => {
  const generated = await generate(appFolder);
  const files = [...generated.router, ...generated.types];
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
