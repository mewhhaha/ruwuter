#!/usr/bin/env node --experimental-strip-types --no-warnings

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { generate } from "./js.ts";

const appFolder = path.normalize(process.argv[2]);

const { router, types } = await generate(appFolder);
const files = [...router, ...types];

await Promise.all(
  files.map(async ({ path: outputPath, contents }) => {
    const absolutePath = path.resolve(outputPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }),
);
