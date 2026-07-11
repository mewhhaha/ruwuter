import path from "node:path";

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

const clientImportLocals = (program: Node): Set<string> => {
  const locals = new Set<string>();
  for (const statement of program.body as Node[]) {
    if (
      statement.type !== "ImportDeclaration" ||
      (statement.source as { value?: unknown }).value !== "@mewhhaha/ruwuter/browser"
    ) continue;
    if (
      (statement.specifiers as Node[]).some((specifier) =>
        specifier.type === "ImportSpecifier" && ((specifier.imported as Node).name) === "client"
      )
    ) {
      for (const specifier of statement.specifiers as Node[]) {
        if (
          specifier.type === "ImportSpecifier" && ((specifier.imported as Node).name) === "client"
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

const selectedImportSources = (
  program: Node,
  source: string,
  used: Set<string>,
  importer: string,
): string => {
  const imports: string[] = [];
  for (const statement of program.body as Node[]) {
    if (statement.type !== "ImportDeclaration") continue;
    const specifiers = (statement.specifiers as Node[]).filter((specifier) =>
      used.has(((specifier.local as Node).name) as string)
    );
    if (!specifiers.length) continue;
    const originalSpecifier = (statement.source as { value: string }).value;
    const moduleSource = JSON.stringify(
      originalSpecifier.startsWith(".")
        ? path.resolve(path.dirname(importer), originalSpecifier)
        : originalSpecifier,
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

const publicVirtualId = (id: string): string => `/@id/${id.replace("\0", "__x00__")}`;

/** Experimental `client()` extractor. It is deliberately Vite-only and opt-in. */
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

  transform(
    context: TransformContext,
    source: string,
    id: string,
  ): { code: string; map: null } | undefined {
    if (!/\.[cm]?[jt]sx?$/.test(path.basename(id)) || id.startsWith("\0")) return;
    let program: Node;
    try {
      program = context.parse(source);
    } catch {
      return;
    }
    const bindings = moduleBindings(program);
    const clientLocals = clientImportLocals(program);
    if (!clientLocals.size) return;
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
        const importCode = selectedImportSources(program, source, captures.imports, id);
        this.#modules.set(virtualId, {
          source: `${importCode}\nimport { defineController } from "@mewhhaha/ruwuter/browser";\n` +
            `export default defineController(${source.slice(callback.start, callback.end)});\n`,
        });
        const fileName = `assets/ruwuter-client-${this.buildId}-${this.#nextFile++}.js`;
        const reference = this.isBuild()
          ? context.emitFile({ type: "chunk", id: virtualId, fileName })
          : undefined;
        const value = reference
          ? JSON.stringify(
            `${this.base().endsWith("/") ? this.base() : `${this.base()}/`}${fileName}`,
          )
          : JSON.stringify(publicVirtualId(virtualId));
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
    if (!replacements.length) return;
    let code = source;
    for (const replacement of replacements.toSorted((a, b) => b.start - a.start)) {
      code = code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end);
    }
    return { code, map: null };
  }
}
