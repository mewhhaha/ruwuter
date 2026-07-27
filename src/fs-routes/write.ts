import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "./js.ts";
import { generateControllers, GENERATED_CONTROLLERS_MARKER } from "./generate-controllers.ts";
import { assertInsideGeneratedTypesRoot, generatedTypesRoot } from "./paths.ts";
import type { GeneratedFile, GenerateResult } from "./types.ts";

export { generatedTypesRoot } from "./paths.ts";

/**
 * Generates the controller barrel and reconciles it with whatever
 * `controllers.ts` is already on disk: a user-owned file is never overwritten,
 * and a previously generated one is removed once no controllers remain.
 */
const reconcileControllers = async (appFolder: string): Promise<GeneratedFile[]> => {
  const controllers = await generateControllers(appFolder);
  const controllersPath = path.resolve(appFolder, "controllers.ts");
  const existing = await readFile(controllersPath, "utf8").catch(() => undefined);
  const isGenerated = existing?.startsWith(GENERATED_CONTROLLERS_MARKER) ?? false;
  if (controllers.length && existing && !isGenerated) {
    throw new Error(`Refusing to overwrite user-owned controller file: ${controllersPath}`);
  }
  if (!controllers.length && isGenerated) await rm(controllersPath, { force: true });
  return controllers;
};

export const writeGeneratedFiles = async (
  appFolder: string,
  options: { controllers?: boolean } = {},
): Promise<GenerateResult> => {
  const { router, types } = await generate(appFolder);
  const controllers = options.controllers ? await reconcileControllers(appFolder) : [];
  const generated: GenerateResult = { router, types, controllers };
  const files = [...router, ...types, ...controllers];
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
