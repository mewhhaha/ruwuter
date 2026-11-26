#!/usr/bin/env node

import path from "node:path";
import { writeGeneratedFiles } from "./write.ts";

const appFolder = path.normalize(process.argv[2] ?? "./app");
await writeGeneratedFiles(appFolder);
