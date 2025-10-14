#!/usr/bin/env node --experimental-strip-types --no-warnings

import path from "node:path";
import { generate } from "./js.mts";

const appFolder = path.normalize(process.argv[2]);

await generate(appFolder);
