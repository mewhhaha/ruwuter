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

import { generateRouter } from "./generate-router.mts";
import { generateTypes } from "./generate-types.mts";
import { generateClientHandlerTypes } from "./generate-client-handlers.mts";

/**
 * Generates router and TypeScript types from a file-system based route structure.
 *
 * @param appFolder - Path to the folder containing route files
 * @returns Promise that resolves when generation is complete
 */
export const generate = async (appFolder: string): Promise<void> => {
  await generateRouter(appFolder);
  console.log("✅ Generated router for", appFolder);
  await generateTypes(appFolder);
  console.log("✅ Generated types for", appFolder);
};
