declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare module "*?ruwuter-controller-url" {
  const href: string;
  export default href;
}
