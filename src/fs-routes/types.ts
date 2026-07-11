export type GeneratedFile = {
  path: string;
  contents: string;
};

export type GenerateResult = {
  router: GeneratedFile[];
  types: GeneratedFile[];
  controllers: GeneratedFile[];
};
