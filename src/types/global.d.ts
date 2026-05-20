/**
 * Global type declarations
 *
 * This file provides global type definitions for the application.
 *
 * NOTE: This file intentionally does NOT re-export framework symbols
 * (Logger, Router, HttpException, HttpMethod, ...) as ambient globals.
 * Doing so masks missing `import` statements — the code type-checks but
 * throws `ReferenceError` at runtime. Always import framework symbols
 * explicitly from their module.
 */

declare module 'http-methods' {
  interface HttpMethods {
    GET: string;
    POST: string;
    PUT: string;
    DELETE: string;
    PATCH: string;
    HEAD: string;
    OPTIONS: string;
    TRACE: string;
  }
  const methods: HttpMethods;
  export = methods;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT?: string;
    }
  }

  interface Dictionary<T> {
    [key: string]: T;
  }

  interface Crypto {
    randomString(length: number): string;
  }
}

export {};
