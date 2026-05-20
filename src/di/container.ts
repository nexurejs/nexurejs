import { getInjectionMetadata } from '../decorators/injection-decorators.js';

/**
 * Dependency injection scope
 */
export enum Scope {
  /**
   * Singleton scope - one instance per container
   */
  SINGLETON = 'singleton',

  /**
   * Transient scope - new instance each time
   */
  TRANSIENT = 'transient',

  /**
   * Request scope - one instance per request
   */
  REQUEST = 'request'
}

/**
 * Provider options
 */
export interface ProviderOptions {
  /**
   * Provider scope
   * @default Scope.SINGLETON
   */
  scope?: Scope;

  /**
   * Provider token
   */
  token?: any;
}

/**
 * Provider definition
 */
interface ProviderDefinition {
  /**
   * Provider token
   */
  token: any;

  /**
   * Provider class
   */
  useClass: any;

  /**
   * Provider scope
   */
  scope: Scope;

  /**
   * Provider instance (for singletons)
   */
  instance?: any;
}

/**
 * Dependency injection container
 */
export class Container {
  private providers = new Map<any, ProviderDefinition>();

  /**
   * Register a provider
   * @param provider The provider to register
   * @param options Provider options
   */
  register(provider: any, options: ProviderOptions = {}): this {
    const token = options.token || provider;
    // Honor the scope declared via @Injectable(scope) when no explicit option
    // is given; otherwise fall back to singleton.
    const scope = options.scope || getInjectionMetadata(provider)?.scope || Scope.SINGLETON;

    this.providers.set(token, {
      token,
      useClass: provider,
      scope
    });

    return this;
  }

  /**
   * Resolve a provider
   * @param token The provider token
   */
  resolve<T = any>(token: any): T {
    const provider = this.providers.get(token);

    if (!provider) {
      // If the token is not registered, try to register it automatically
      if (typeof token === 'function') {
        this.register(token);
        return this.resolve<T>(token);
      }

      throw new Error(`Provider not found: ${token}`);
    }

    // Return existing instance for singletons
    if (provider.scope === Scope.SINGLETON && provider.instance) {
      return provider.instance as T;
    }

    // Create a new instance
    const instance = this.createInstance<T>(provider.useClass);

    // Store the instance for singletons
    if (provider.scope === Scope.SINGLETON) {
      provider.instance = instance;
    }

    return instance;
  }

  /**
   * Create an instance of a class with dependencies injected
   * @param target The class to instantiate
   */
  private createInstance<T>(target: any): T {
    // Get constructor parameters
    const params = this.getInjectedParams(target);

    // Create the instance
    const instance = new target(...params);

    // Inject properties
    this.injectProperties(instance, target);

    return instance as T;
  }

  /**
   * Get injected constructor parameters
   * @param target The class to get parameters for
   */
  private getInjectedParams(target: any): any[] {
    const metadata = getInjectionMetadata(target);

    if (!metadata?.params || metadata.params.length === 0) {
      return [];
    }

    // Place each resolved dependency at its declared parameter index.
    // metadata.params is in decorator-application order (TypeScript applies
    // parameter decorators last-parameter-first), NOT parameter index order,
    // so a positional .map() here would swap the constructor arguments.
    const maxIndex = metadata.params.reduce(
      (max: number, param: any) => Math.max(max, param.index),
      -1
    );
    const args = new Array(maxIndex + 1);

    for (const param of metadata.params) {
      if (!param.type) {
        throw new Error(
          `Cannot inject parameter at index ${param.index} in ${target.name}: type not specified`
        );
      }
      args[param.index] = this.resolve(param.type);
    }

    return args;
  }

  /**
   * Inject properties into an instance
   * @param instance The instance to inject properties into
   * @param target The class of the instance
   */
  private injectProperties(instance: any, target: any): void {
    const metadata = getInjectionMetadata(target);

    if (!metadata?.properties) {
      return;
    }

    for (const [propertyKey, type] of Object.entries(metadata.properties)) {
      instance[propertyKey] = this.resolve(type);
    }
  }

  /**
   * Get all registered instances
   * @returns Set of all singleton instances and creates transient instances
   */
  getAllInstances(): Set<any> {
    const instances = new Set<any>();

    // Get all registered providers
    for (const def of this.providers.values()) {
      if (def.scope === Scope.SINGLETON) {
        // For singletons, use existing instance or create if not exists
        if (!def.instance) {
          def.instance = this.createInstance(def.useClass);
        }
        instances.add(def.instance);
      } else if (def.scope === Scope.TRANSIENT) {
        // For transient, create a new instance
        instances.add(this.createInstance(def.useClass));
      }
      // Skip request scope as they should be created per request
    }

    return instances;
  }

  /**
   * Get all registered provider classes
   * @returns Array of all registered provider classes
   */
  getAllProviders(): any[] {
    return Array.from(this.providers.values()).map(def => def.useClass);
  }
}
