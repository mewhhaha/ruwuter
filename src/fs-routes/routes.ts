#!/usr/bin/env node --experimental-strip-types --no-warnings

import path from "node:path";
import process from "node:process";
import { writeGeneratedFiles } from "./write.ts";

const appFolder = path.normalize(process.argv[2]);
await writeGeneratedFiles(appFolder);
