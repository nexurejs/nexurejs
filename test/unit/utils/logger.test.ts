/**
 * Tests for the Logger: transports, level filtering, and custom formatters.
 */

import { describe, test, expect, vi } from 'vitest';
import { Logger, LogLevel } from '../../../src/utils/logger.js';

describe('Logger', () => {
  test('a console:false logger writes nothing to the console', () => {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    new Logger({ console: false }).info('should be silent');
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
    for (const spy of spies) {
      spy.mockRestore();
    }
  });

  test('routes records to a custom transport', () => {
    const records: string[] = [];
    const logger = new Logger({
      console: false,
      transports: [{ log: (_level, message) => records.push(message) }]
    });
    logger.info('hello');
    expect(records).toHaveLength(1);
    expect(records[0]).toContain('hello');
  });

  test('drops messages below the configured level', () => {
    const records: string[] = [];
    const logger = new Logger({
      console: false,
      level: LogLevel.WARN,
      transports: [{ log: (_level, message) => records.push(message) }]
    });
    logger.info('info-msg'); // below WARN — dropped
    logger.warn('warn-msg'); // at WARN — kept
    logger.error('error-msg'); // above WARN — kept
    expect(records).toHaveLength(2);
  });

  test('applies a custom formatter registered for a level', () => {
    const records: string[] = [];
    const logger = new Logger({
      console: false,
      transports: [{ log: (_level, message) => records.push(message) }],
      formatters: { INFO: () => ['[formatted]'] }
    });
    logger.info('original');
    expect(records[0]).toContain('[formatted]');
  });
});
