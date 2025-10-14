export {};

declare global {
  interface Window {
    __client?: {
      load: (spec: string) => Promise<any>;
      set: (id: string, next: any | ((prev: any) => any)) => void;
      get: (id: string) => any;
      state: Map<string, any>;
    };
  }
}

