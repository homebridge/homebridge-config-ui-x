/**
 * Pollyfill for Node.js 11.x that does not support `globalThis`
 * This should be removed when support for < Node.js 12 is dropped
 */
if (!global.globalThis && process.versions.modules === '67') {
  (global as any).globalThis = global;
}
