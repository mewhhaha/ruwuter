export {};

declare global {
  interface Window {
    __client?: {
      load: (spec: string) => Promise<any>;
      set: (id: string, next: any | ((prev: any) => any)) => void;
      get: (id: string) => any;
      state: Map<string, any>;
    };
    __ruwuter?: {
      loadModule?: (spec: string) => Promise<Record<string, unknown>>;
      store?: {
        set(id: string, next: unknown | ((prev: unknown) => unknown)): void;
        get(id: string): unknown;
        watch(id: string, fn: () => void): () => void;
        ref(
          id: string,
          initial: unknown,
        ): {
          readonly id: string;
          get(): unknown;
          set(next: unknown | ((prev: unknown) => unknown)): void;
          toJSON(): { __ref: true; i: string; v: unknown };
        };
      };
    };
  }
}
