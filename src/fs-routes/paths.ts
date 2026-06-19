import path from "node:path";
import process from "node:process";

export const GENERATED_TYPES_ROOT = path.join(".router", "types");

const safeTypesSegment = (value: string): string => {
  const segment = value
    .replaceAll(path.sep, "__")
    .replaceAll(/[\\/]+/g, "__")
    .replaceAll(/[^A-Za-z0-9_.-]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return segment || "app";
};

export const generatedTypesRoot = (appFolder: string): string => {
  const resolvedAppFolder = path.resolve(appFolder);
  const relativeAppFolder = path.relative(process.cwd(), resolvedAppFolder);
  const isWithinCwd = relativeAppFolder &&
    !relativeAppFolder.startsWith("..") &&
    !path.isAbsolute(relativeAppFolder);
  const folderId = relativeAppFolder === ""
    ? safeTypesSegment(path.basename(resolvedAppFolder))
    : isWithinCwd
    ? relativeAppFolder.split(path.sep).map(safeTypesSegment).join(path.sep)
    : safeTypesSegment(resolvedAppFolder);

  return path.join(GENERATED_TYPES_ROOT, folderId);
};

export const assertInsideGeneratedTypesRoot = (target: string): void => {
  const root = path.resolve(GENERATED_TYPES_ROOT);
  const resolved = path.resolve(target);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to remove generated types outside ${GENERATED_TYPES_ROOT}.`);
  }
};
