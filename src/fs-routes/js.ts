/**
 * @module
 *
 * File-system based routing generator for Ruwuter applications.
 * Automatically generates routes and TypeScript types from your file structure.
 *
 * @example
 * ```typescript
 * import { generate } from "@mewhhaha/ruwuter/fs-routes";
 *
 * // Generate routes from the app folder
 * await generate("./app");
 * ```
 */

import { generateRouter } from "./generate-router.ts";
import { generateTypes } from "./generate-types.ts";
import type { GenerateResult } from "./types.ts";

/**
 * Generates router and TypeScript types from a file-system based route structure.
 *
 * @param appFolder - Path to the folder containing route files
 * @returns Generated router and type artifacts
 */
export const generate = async (appFolder: string): Promise<GenerateResult> => {
  const router = generateRouter(appFolder);
  const types = generateTypes(appFolder)
  return { router: await router, types: await types };
};
