/**
 * Tests for the dependency-injection container: registration, scopes,
 * auto-registration, and constructor injection.
 */

import { describe, test, expect } from 'vitest';
import { Container, Scope } from '../../../src/di/container.js';
import {
  Injectable,
  Inject,
  getInjectionMetadata
} from '../../../src/decorators/injection-decorators.js';

describe('DI Container', () => {
  test('resolves a class that has no dependencies', () => {
    class Service {
      value = 'service';
    }
    const container = new Container();
    expect(container.resolve<Service>(Service).value).toBe('service');
  });

  test('auto-registers an unknown class token on resolve', () => {
    class Lonely {}
    const container = new Container();
    expect(container.resolve(Lonely)).toBeInstanceOf(Lonely);
  });

  test('singleton providers resolve to the same instance', () => {
    class Repo {}
    const container = new Container();
    container.register(Repo, { scope: Scope.SINGLETON });
    expect(container.resolve(Repo)).toBe(container.resolve(Repo));
  });

  test('transient providers resolve to fresh instances', () => {
    class Job {}
    const container = new Container();
    container.register(Job, { scope: Scope.TRANSIENT });
    expect(container.resolve(Job)).not.toBe(container.resolve(Job));
  });

  test('honors the scope declared by @Injectable', () => {
    @Injectable(Scope.TRANSIENT)
    class FreshEachTime {}

    const container = new Container();
    container.register(FreshEachTime); // no explicit scope — must use @Injectable's
    expect(container.resolve(FreshEachTime)).not.toBe(container.resolve(FreshEachTime));
  });

  test('decorating a subclass does not corrupt the base class injection metadata', () => {
    class Dependency {}

    class BaseService {
      constructor(@Inject(Dependency) public dep: Dependency) {}
    }

    class DerivedService extends BaseService {
      constructor(
        @Inject(Dependency) dep: Dependency,
        @Inject(Dependency) public extra: Dependency
      ) {
        super(dep);
      }
    }

    void DerivedService;
    // Regression: the subclass's @Inject decorators must not append into the
    // base class's (prototype-chain-inherited) parameter metadata.
    expect(getInjectionMetadata(BaseService)?.params?.length).toBe(1);
  });

  test('injects multiple constructor dependencies at their correct indices', () => {
    class Alpha {
      readonly name = 'alpha';
    }
    class Beta {
      readonly name = 'beta';
    }

    class Consumer {
      constructor(
        @Inject(Alpha) public a: Alpha,
        @Inject(Beta) public b: Beta
      ) {}
    }

    const container = new Container();
    const consumer = container.resolve<Consumer>(Consumer);

    // Regression guard: TypeScript applies parameter decorators last-first, so
    // the injection metadata is not in index order. Arguments must still land
    // at their declared positions.
    expect(consumer.a).toBeInstanceOf(Alpha);
    expect(consumer.b).toBeInstanceOf(Beta);
    expect(consumer.a.name).toBe('alpha');
    expect(consumer.b.name).toBe('beta');
  });
});
