/**
 * Browser polyfills required by ethers.js and other Node.js libraries.
 * This file is referenced in angular.json under "polyfills".
 */

// Make window.global available (required by some Node.js libs)
(window as any).global = window;

// Provide Buffer globally
import { Buffer } from "buffer";
(window as any).Buffer = Buffer;
