import path from "node:path";
import { createRequire } from "node:module";

type Node = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

type TransformContext = {
  parse(source: string): Node;
  emitFile(file: { type: "chunk"; id: string; fileName?: string }): string;
  error(error: { message: string; id: string; pos: number }): never;
  resolve(
    source: string,
    importer: string,
    options: { skipSelf: true },
  ): Promise<{ id: string } | null>;
};

type ExtractedModule = {
  source: string;
};

const VIRTUAL_PREFIX = "\0ruwuter-client:";
type Scope = {
  parent?: Scope;
  names: Set<string>;
};

const childNodes = (node: Node): Node[] =>
  Object.entries(node)
    .filter(([key]) => key !== "start" && key !== "end" && key !== "type")
    .flatMap(([, value]) => {
      if (Array.isArray(value)) {
        return value.filter((item): item is Node =>
          typeof item === "object" && item !== null && "type" in item
        );
      }
      return typeof value === "object" && value !== null && "type" in value ? [value as Node] : [];
    });

const namesInPattern = (node: Node, names: Set<string>): void => {
  if (node.type === "Identifier") {
    names.add(node.name as string);
    return;
  }
  if (node.type === "AssignmentPattern") {
    namesInPattern(node.left as Node, names);
    return;
  }
  if (node.type === "RestElement") {
    namesInPattern(node.argument as Node, names);
    return;
  }
  if (node.type === "Property") {
    namesInPattern(node.value as Node, names);
    return;
  }
  for (const child of childNodes(node)) namesInPattern(child, names);
};

const functionScopedVarNames = (node: Node, names: Set<string>, root = true): void => {
  if (
    !root &&
    [
      "ArrowFunctionExpression",
      "ClassDeclaration",
      "ClassExpression",
      "FunctionDeclaration",
      "FunctionExpression",
    ].includes(node.type)
  ) return;
  if (node.type === "VariableDeclaration" && node.kind === "var") {
    for (const declaration of node.declarations as Node[]) {
      namesInPattern(declaration.id as Node, names);
    }
  }
  for (const child of childNodes(node)) functionScopedVarNames(child, names, false);
};

const isReference = (node: Node, parent: Node | undefined): boolean => {
  if (node.type !== "Identifier" || !parent) return false;
  if (
    [
      "VariableDeclarator",
      "FunctionDeclaration",
      "FunctionExpression",
      "ClassDeclaration",
      "ImportSpecifier",
      "ImportDefaultSpecifier",
      "ImportNamespaceSpecifier",
    ].includes(parent.type)
  ) return false;
  if (parent.type === "AssignmentPattern" && parent.left === node) return false;
  if (
    parent.type === "Property" && (parent.key === node) && !parent.computed &&
    !parent.shorthand
  ) return false;
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) {
    return false;
  }
  if (parent.type === "MethodDefinition" && parent.key === node && !parent.computed) return false;
  if (
    parent.type === "LabeledStatement" || parent.type === "BreakStatement" ||
    parent.type === "ContinueStatement"
  ) return false;
  return true;
};

const moduleBindings = (program: Node): Map<string, "import" | "local"> => {
  const names = new Map<string, "import" | "local">();
  for (const statement of program.body as Node[]) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers as Node[]) {
        names.set(((specifier.local as Node).name) as string, "import");
      }
      continue;
    }
    const declaration = statement.type === "ExportNamedDeclaration"
      ? statement.declaration as Node | undefined
      : statement;
    if (!declaration) continue;
    if (declaration.type === "VariableDeclaration") {
      for (const variable of declaration.declarations as Node[]) {
        const bindings = new Set<string>();
        namesInPattern(variable.id as Node, bindings);
        for (const binding of bindings) names.set(binding, "local");
      }
    } else if (
      ["FunctionDeclaration", "ClassDeclaration"].includes(declaration.type) && declaration.id
    ) {
      names.set((declaration.id as Node).name as string, "local");
    }
  }
  const vars = new Set<string>();
  functionScopedVarNames(program, vars);
  for (const name of vars) names.set(name, "local");
  return names;
};

const browserImportLocals = (program: Node, importedName: "client" | "move"): Set<string> => {
  const locals = new Set<string>();
  for (const statement of program.body as Node[]) {
    if (
      statement.type !== "ImportDeclaration" ||
      (statement.source as { value?: unknown }).value !== "@mewhhaha/ruwuter/browser"
    ) continue;
    if (
      (statement.specifiers as Node[]).some((specifier) =>
        specifier.type === "ImportSpecifier" &&
        ((specifier.imported as Node).name) === importedName
      )
    ) {
      for (const specifier of statement.specifiers as Node[]) {
        if (
          specifier.type === "ImportSpecifier" &&
          ((specifier.imported as Node).name) === importedName
        ) {
          locals.add((specifier.local as Node).name as string);
        }
      }
    }
  }
  return locals;
};

const addDirectBindings = (node: Node, scope: Scope): void => {
  const statements = node.type === "Program" || node.type === "BlockStatement"
    ? node.body as Node[]
    : [node];
  for (const statement of statements) {
    if (statement.type === "VariableDeclaration") {
      if (statement.kind === "var") continue;
      for (const declaration of statement.declarations as Node[]) {
        namesInPattern(declaration.id as Node, scope.names);
      }
    } else if (
      ["FunctionDeclaration", "ClassDeclaration"].includes(statement.type) && statement.id
    ) {
      scope.names.add((statement.id as Node).name as string);
    }
  }
};

const lookup = (scope: Scope | undefined, name: string): boolean => {
  for (let current = scope; current; current = current.parent) {
    if (current.names.has(name)) return true;
  }
  return false;
};

const callbackCaptures = (
  callback: Node,
  bindings: Map<string, "import" | "local">,
): { imports: Set<string>; locals: Set<string> } => {
  const imports = new Set<string>();
  const locals = new Set<string>();
  const root: Scope = { names: new Set() };
  for (const parameter of callback.params as Node[]) namesInPattern(parameter, root.names);
  functionScopedVarNames(callback.body as Node, root.names);

  const visitPatternExpressions = (pattern: Node, scope: Scope): void => {
    if (pattern.type === "AssignmentPattern") {
      visit(pattern.right as Node, scope, pattern);
      visitPatternExpressions(pattern.left as Node, scope);
      return;
    }
    if (pattern.type === "RestElement") {
      visitPatternExpressions(pattern.argument as Node, scope);
      return;
    }
    if (pattern.type === "Property") {
      if (pattern.computed) visit(pattern.key as Node, scope, pattern);
      visitPatternExpressions(pattern.value as Node, scope);
      return;
    }
    if (pattern.type === "Identifier") return;
    for (const child of childNodes(pattern)) visitPatternExpressions(child, scope);
  };

  const visit = (node: Node, scope: Scope, parent?: Node, isRoot = false): void => {
    if (
      !isRoot &&
      ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)
    ) {
      const child: Scope = { parent: scope, names: new Set() };
      if (node.id) namesInPattern(node.id as Node, child.names);
      for (const parameter of node.params as Node[]) namesInPattern(parameter, child.names);
      functionScopedVarNames(node.body as Node, child.names);
      for (const parameter of node.params as Node[]) visitPatternExpressions(parameter, child);
      if ((node.body as Node).type === "BlockStatement") {
        addDirectBindings(node.body as Node, child);
      }
      visit(node.body as Node, child, node);
      return;
    }
    if (node.type === "BlockStatement") {
      const child: Scope = { parent: scope, names: new Set() };
      addDirectBindings(node, child);
      for (const childNode of childNodes(node)) visit(childNode, child, node);
      return;
    }
    if (node.type === "CatchClause") {
      const child: Scope = { parent: scope, names: new Set() };
      if (node.param) namesInPattern(node.param as Node, child.names);
      visit(node.body as Node, child, node);
      return;
    }
    if (isReference(node, parent)) {
      const name = node.name as string;
      if (!lookup(scope, name)) {
        const binding = bindings.get(name);
        if (binding === "import") imports.add(name);
        if (binding === "local") locals.add(name);
      }
    }
    for (const child of childNodes(node)) visit(child, scope, node);
  };
  visit(callback, root, undefined, true);
  return { imports, locals };
};

const resolveBrowserSpecifier = async (
  context: TransformContext,
  specifier: string,
  importer: string,
): Promise<string> => {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(importer), specifier);
  if (specifier.startsWith("/") || /^[a-z][\w+.-]*:/i.test(specifier)) return specifier;
  const resolved = await context.resolve(specifier, importer, { skipSelf: true });
  if (resolved?.id && resolved.id !== specifier) return resolved.id;
  try {
    return createRequire(importer).resolve(specifier);
  } catch (error) {
    throw new TypeError(`Browser dependency could not be resolved: ${specifier}`, { cause: error });
  }
};

const selectedImportSources = async (
  context: TransformContext,
  program: Node,
  source: string,
  used: Set<string>,
  importer: string,
): Promise<string> => {
  const imports: string[] = [];
  for (const statement of program.body as Node[]) {
    if (statement.type !== "ImportDeclaration") continue;
    const specifiers = (statement.specifiers as Node[]).filter((specifier) =>
      used.has(((specifier.local as Node).name) as string)
    );
    if (!specifiers.length) continue;
    const originalSpecifier = (statement.source as { value: string }).value;
    const moduleSource = JSON.stringify(
      await resolveBrowserSpecifier(context, originalSpecifier, importer),
    );
    const attributes = source.slice((statement.source as Node).end, statement.end)
      .replace(/;\s*$/, "").trim();
    const defaultSpecifier = specifiers.find((specifier) =>
      specifier.type === "ImportDefaultSpecifier"
    );
    const namespaceSpecifier = specifiers.find((specifier) =>
      specifier.type === "ImportNamespaceSpecifier"
    );
    const namedSpecifiers = specifiers.filter((specifier) => specifier.type === "ImportSpecifier");
    if (namespaceSpecifier) {
      const namespace = `* as ${(namespaceSpecifier.local as Node).name}`;
      const clause = defaultSpecifier
        ? `${(defaultSpecifier.local as Node).name}, ${namespace}`
        : namespace;
      imports.push(`import ${clause} from ${moduleSource}${attributes ? ` ${attributes}` : ""};`);
      continue;
    }
    const defaultName = defaultSpecifier
      ? (defaultSpecifier.local as Node).name as string
      : undefined;
    const named = namedSpecifiers.map((specifier) => {
      const importedNode = specifier.imported as Node;
      const imported = (importedNode.name ?? JSON.stringify(importedNode.value)) as string;
      const local = (specifier.local as Node).name as string;
      return imported === local ? imported : `${imported} as ${local}`;
    });
    const clause = [defaultName, named.length ? `{ ${named.join(", ")} }` : undefined]
      .filter((value): value is string => Boolean(value)).join(", ");
    imports.push(`import ${clause} from ${moduleSource}${attributes ? ` ${attributes}` : ""};`);
  }
  return imports.join("\n");
};

const extractedCallbackSource = async (
  context: TransformContext,
  callback: Node,
  source: string,
  importer: string,
): Promise<string> => {
  const imports: Array<{ start: number; end: number; specifier: string }> = [];
  const visit = (node: Node): void => {
    if (node.type === "ImportExpression") {
      const specifier = node.source as Node;
      const value = specifier.value;
      if (typeof value === "string") {
        imports.push({ start: specifier.start, end: specifier.end, specifier: value });
      }
    }
    for (const child of childNodes(node)) visit(child);
  };
  visit(callback);

  let code = source.slice(callback.start, callback.end);
  const replacements = await Promise.all(imports.map(async ({ start, end, specifier }) => ({
    start,
    end,
    value: JSON.stringify(await resolveBrowserSpecifier(context, specifier, importer)),
  })));
  for (const replacement of replacements.toSorted((a, b) => b.start - a.start)) {
    const start = replacement.start - callback.start;
    const end = replacement.end - callback.start;
    code = code.slice(0, start) + replacement.value + code.slice(end);
  }
  return code;
};

const publicVirtualId = (id: string): string => `/@id/${id.replace("\0", "__x00__")}`;

/** Experimental `client()` and `move()` extractor. It is deliberately Vite-only and opt-in. */
export class ClientMacro {
  #modules = new Map<string, ExtractedModule>();
  #nextFile = 0;

  constructor(
    private readonly isBuild: () => boolean,
    private readonly base: () => string,
    private readonly buildId: string,
  ) {}

  resolveId(id: string): string | undefined {
    if (id.startsWith("/@id/__x00__ruwuter-client:")) {
      return `\0${id.slice("/@id/__x00__".length)}`;
    }
    return id.startsWith(VIRTUAL_PREFIX) ? id : undefined;
  }

  load(id: string): string | undefined {
    return this.#modules.get(id)?.source;
  }

  #registerModule(
    context: TransformContext,
    virtualId: string,
    source: string,
    assetName: "client" | "move",
  ): string {
    this.#modules.set(virtualId, { source });
    const fileName = `assets/ruwuter-${assetName}-${this.buildId}-${this.#nextFile++}.js`;
    const reference = this.isBuild()
      ? context.emitFile({ type: "chunk", id: virtualId, fileName })
      : undefined;
    if (!reference) return publicVirtualId(virtualId);
    return `${this.base().endsWith("/") ? this.base() : `${this.base()}/`}${fileName}`;
  }

  async transform(
    context: TransformContext,
    source: string,
    id: string,
  ): Promise<{ code: string; map: null } | undefined> {
    if (!/\.[cm]?[jt]sx?$/.test(path.basename(id)) || id.startsWith("\0")) return;
    let program: Node;
    try {
      program = context.parse(source);
    } catch {
      return;
    }
    const bindings = moduleBindings(program);
    const clientLocals = browserImportLocals(program, "client");
    const moveLocals = browserImportLocals(program, "move");
    if (!clientLocals.size && !moveLocals.size) return;
    const replacements: Array<{ start: number; end: number; value: string }> = [];
    const handledCalls = new Set<number>();

    for (const statement of program.body as Node[]) {
      const declaration = statement.type === "ExportNamedDeclaration"
        ? statement.declaration as Node | undefined
        : statement;
      if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") continue;
      for (const variable of declaration.declarations as Node[]) {
        const init = variable.init as Node | undefined;
        if (
          init?.type !== "CallExpression" || (init.callee as Node).type !== "Identifier" ||
          !clientLocals.has((init.callee as Node).name as string)
        ) continue;
        handledCalls.add(init.start);
        const callback = (init.arguments as Node[])[0];
        if (
          !callback || !["ArrowFunctionExpression", "FunctionExpression"].includes(callback.type) ||
          (init.arguments as Node[]).length !== 1
        ) {
          context.error({
            message: "[ruwuter] client() requires exactly one function callback.",
            id,
            pos: init.start,
          });
        }
        const captures = callbackCaptures(callback, bindings);
        if (captures.locals.size) {
          context.error({
            message: `[ruwuter] client() callback captures ${
              [...captures.locals].map((name) => JSON.stringify(name)).join(", ")
            }. ` +
              "Only imported bindings may be captured; pass server values through controller props instead.",
            id,
            pos: callback.start,
          });
        }
        const virtualId = `${VIRTUAL_PREFIX}${encodeURIComponent(id)}:${replacements.length}.ts`;
        const importCode = await selectedImportSources(
          context,
          program,
          source,
          captures.imports,
          id,
        );
        const moduleSource =
          `${importCode}\nimport { defineController } from "@mewhhaha/ruwuter/browser";\n` +
          `export default defineController(${source.slice(callback.start, callback.end)});\n`;
        const value = JSON.stringify(
          this.#registerModule(context, virtualId, moduleSource, "client"),
        );
        replacements.push({ start: init.start, end: init.end, value });
      }
    }
    const assertTopLevelCalls = (node: Node): void => {
      if (
        node.type === "CallExpression" && (node.callee as Node).type === "Identifier" &&
        clientLocals.has((node.callee as Node).name as string) && !handledCalls.has(node.start)
      ) {
        context.error({
          message: "[ruwuter] client() must be assigned directly to a top-level const declaration.",
          id,
          pos: node.start,
        });
      }
      for (const child of childNodes(node)) assertTopLevelCalls(child);
    };
    assertTopLevelCalls(program);

    const visibleBindings = (scope: Scope): Map<string, "import" | "local"> => {
      const visible = new Map(bindings);
      const scopes: Scope[] = [];
      for (let current: Scope | undefined = scope; current; current = current.parent) {
        scopes.push(current);
      }
      for (const current of scopes.toReversed()) {
        for (const name of current.names) visible.set(name, "local");
      }
      return visible;
    };

    const extractMovedCalls = async (
      node: Node,
      scope: Scope,
      isRoot = false,
    ): Promise<void> => {
      if (node.type === "VariableDeclaration" && node.kind !== "var") {
        for (const declaration of node.declarations as Node[]) {
          namesInPattern(declaration.id as Node, scope.names);
        }
      }
      if (
        node.type === "CallExpression" && (node.callee as Node).type === "Identifier" &&
        moveLocals.has((node.callee as Node).name as string)
      ) {
        if (
          replacements.some((replacement) =>
            node.start >= replacement.start && node.end <= replacement.end
          )
        ) {
          context.error({
            message: "[ruwuter] move() cannot be declared inside client().",
            id,
            pos: node.start,
          });
        }
        const args = node.arguments as Node[];
        const callback = args[1];
        if (
          args.length !== 2 || !callback ||
          !["ArrowFunctionExpression", "FunctionExpression"].includes(callback.type)
        ) {
          context.error({
            message: "[ruwuter] move() requires JSON values and one function callback.",
            id,
            pos: node.start,
          });
        }
        const captures = callbackCaptures(callback, visibleBindings(scope));
        if ([...captures.imports].some((name) => moveLocals.has(name))) {
          context.error({
            message: "[ruwuter] move() callbacks cannot call move().",
            id,
            pos: callback.start,
          });
        }
        if (captures.locals.size) {
          context.error({
            message: `[ruwuter] move() callback captures ${
              [...captures.locals].map((name) => JSON.stringify(name)).join(", ")
            }. Pass server values through move()'s first argument instead.`,
            id,
            pos: callback.start,
          });
        }
        const virtualId = `${VIRTUAL_PREFIX}${encodeURIComponent(id)}:${replacements.length}.ts`;
        const importCode = await selectedImportSources(
          context,
          program,
          source,
          captures.imports,
          id,
        );
        const callbackSource = await extractedCallbackSource(context, callback, source, id);
        const moduleSource = `${importCode}\nexport default ${callbackSource};\n`;
        const value = JSON.stringify(
          this.#registerModule(context, virtualId, moduleSource, "move"),
        );
        replacements.push({ start: callback.start, end: callback.end, value });
        return;
      }

      if (
        !isRoot &&
        ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(
          node.type,
        )
      ) {
        const child: Scope = { parent: scope, names: new Set() };
        if (node.id) namesInPattern(node.id as Node, child.names);
        for (const parameter of node.params as Node[]) namesInPattern(parameter, child.names);
        functionScopedVarNames(node.body as Node, child.names);
        if ((node.body as Node).type === "BlockStatement") {
          addDirectBindings(node.body as Node, child);
        }
        await extractMovedCalls(node.body as Node, child);
        return;
      }
      if (node.type === "BlockStatement") {
        const child: Scope = { parent: scope, names: new Set() };
        addDirectBindings(node, child);
        for (const childNode of childNodes(node)) await extractMovedCalls(childNode, child);
        return;
      }
      if (node.type === "CatchClause") {
        const child: Scope = { parent: scope, names: new Set() };
        if (node.param) namesInPattern(node.param as Node, child.names);
        await extractMovedCalls(node.body as Node, child);
        return;
      }
      for (const child of childNodes(node)) await extractMovedCalls(child, scope);
    };
    const root: Scope = { names: new Set() };
    addDirectBindings(program, root);
    await extractMovedCalls(program, root, true);

    if (!replacements.length) return;
    let code = source;
    for (const replacement of replacements.toSorted((a, b) => b.start - a.start)) {
      code = code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end);
    }
    return { code, map: null };
  }
}
