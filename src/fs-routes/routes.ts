#!/usr/bin/env -S deno run -A

import path from "node:path";
import { writeGeneratedFiles } from "./write.ts";

const appFolder = path.normalize(Deno.args[0] ?? "./app");
await writeGeneratedFiles(appFolder);
