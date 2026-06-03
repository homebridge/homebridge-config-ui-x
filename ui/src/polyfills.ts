/**
 * Polyfills for the Angular application.
 * The app runs zoneless (provideZonelessChangeDetection in main.ts), so Zone.js is not loaded.
 */

// Fixes https://github.com/angular/angular-cli/issues/8160
(window as any).global = window
