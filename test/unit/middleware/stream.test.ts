/**
 * Tests for the streaming helpers: BufferCollector and streamToBuffer.
 */

import { describe, test, expect } from 'vitest';
import { Readable } from 'node:stream';
import { BufferCollector, streamToBuffer } from '../../../src/middleware/stream-middleware.js';

describe('BufferCollector', () => {
  test('collects written chunks into a single buffer', () => {
    const collector = new BufferCollector();
    collector.write(Buffer.from('hello '));
    collector.write(Buffer.from('world'));
    expect(collector.getBuffer().toString()).toBe('hello world');
  });

  test('getBuffer() reflects data written after an earlier getBuffer() call', () => {
    const collector = new BufferCollector();
    collector.write(Buffer.from('first'));
    expect(collector.getBuffer().toString()).toBe('first'); // caches internally
    collector.write(Buffer.from('-second'));
    // Regression: a stale cached buffer must not hide the newly written chunk.
    expect(collector.getBuffer().toString()).toBe('first-second');
  });

  test('getSize reports the total number of bytes written', () => {
    const collector = new BufferCollector();
    collector.write(Buffer.from('abc'));
    collector.write(Buffer.from('de'));
    expect(collector.getSize()).toBe(5);
  });
});

describe('streamToBuffer', () => {
  test('reads a readable stream fully into a buffer', async () => {
    const stream = Readable.from([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    expect((await streamToBuffer(stream)).toString()).toBe('abc');
  });
});
