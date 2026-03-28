import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { generate } from "./js.ts";
import type { GenerateResult } from "./types.ts";

export const generatedTypesRoot = (appFolder: string): string => {
  const resolvedAppFolder = path.resolve(appFolder);
  const relativeAppFolder = path.relative(process.cwd(), resolvedAppFolder) ||
    path.basename(resolvedAppFolder);
  return path.join(".router", "types", relativeAppFolder);
};

export const writeGeneratedFiles = async (
  appFolder: string,
): Promise<GenerateResult> => {
  const generated = await generate(appFolder);
  const files = [...generated.router, ...generated.types];

  await rm(generatedTypesRoot(appFolder), { recursive: true, force: true });

  await Promise.all(
    files.map(async ({ path: outputPath, contents }) => {
      const absolutePath = path.resolve(outputPath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  return generated;
};
