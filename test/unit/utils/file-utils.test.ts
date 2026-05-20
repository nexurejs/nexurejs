/**
 * Tests for file-utils: round-trip writes, safeWrite atomicity, existence.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, readdirSync } from 'node:fs';
import {
  writeFileContents,
  readFileContents,
  readTextFile,
  fileExists,
  copyFile,
  deleteFile
} from '../../../src/utils/file-utils.js';

const created: string[] = [];

afterEach(() => {
  for (const path of created) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* ignore */
    }
  }
  created.length = 0;
});

describe('file-utils', () => {
  test('writeFileContents + readTextFile round-trips with safeWrite', async () => {
    const path = join(tmpdir(), `nexure-rt-${process.pid}-${Date.now()}.txt`);
    created.push(path);
    await writeFileContents(path, 'hello world', { safeWrite: true });
    expect(await readTextFile(path)).toBe('hello world');
  });

  test('safeWrite leaves no .tmp files behind on success', async () => {
    const base = `nexure-clean-${process.pid}-${Date.now()}`;
    const path = join(tmpdir(), `${base}.txt`);
    created.push(path);
    await writeFileContents(path, 'data', { safeWrite: true });
    const leftovers = readdirSync(tmpdir()).filter(
      file => file.startsWith(base) && file.endsWith('.tmp')
    );
    expect(leftovers).toEqual([]);
  });

  test('readFileContents returns the exact file bytes', async () => {
    const path = join(tmpdir(), `nexure-read-${process.pid}-${Date.now()}.bin`);
    created.push(path);
    await writeFileContents(path, 'precise-content');
    const buffer = await readFileContents(path);
    expect(buffer.toString()).toBe('precise-content');
    expect(buffer.length).toBe('precise-content'.length);
  });

  test('copyFile duplicates file content to a new path', async () => {
    const src = join(tmpdir(), `nexure-src-${process.pid}-${Date.now()}.txt`);
    const dst = join(tmpdir(), `nexure-dst-${process.pid}-${Date.now()}.txt`);
    created.push(src, dst);
    await writeFileContents(src, 'copy me');
    await copyFile(src, dst);
    expect(await readTextFile(dst)).toBe('copy me');
  });

  test('fileExists reflects whether a file is present', async () => {
    const path = join(tmpdir(), `nexure-exists-${process.pid}-${Date.now()}.txt`);
    created.push(path);
    expect(await fileExists(path)).toBe(false);
    await writeFileContents(path, 'x');
    expect(await fileExists(path)).toBe(true);
    await deleteFile(path);
    expect(await fileExists(path)).toBe(false);
  });
});
