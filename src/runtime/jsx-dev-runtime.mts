/**
 * @module
 *
 * Development JSX runtime for Ruwuter.
 * Re-exports the production runtime functions with development names.
 *
 * @example
 * ```tsx
 * // This module is automatically used in development mode
 * // when jsxImportSource is set to "@mewhhaha/ruwuter"
 * ```
 */

export { jsx as jsxDEV, jsxs as jsxsDEV } from "./jsx-runtime.mts";
