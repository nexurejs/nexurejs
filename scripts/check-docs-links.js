#!/usr/bin/env node

/**
 * Documentation link checker.
 *
 * Scans every Markdown file under docs/ (plus the top-level README.md,
 * CHANGELOG.md and RELEASING.md) and verifies that relative links point at
 * files that actually exist. External links (http/https/mailto) and bare
 * in-page anchors (#section) are not checked.
 *
 * Exits non-zero if any broken link is found, so it can gate CI / a release.
 *
 * Usage: node scripts/check-docs-links.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const Colors = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BOLD: '\x1b[1m'
};

/** Recursively collect Markdown files under a directory. */
function collectMarkdown(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        collectMarkdown(full, out);
      }
    } else if (entry.name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/** Extract link targets (the `(...)` part of `[text](target)`) from Markdown. */
function extractLinkTargets(markdown) {
  const targets = [];
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    // Drop an optional `"title"` after the URL, then keep the URL itself.
    targets.push(match[1].trim().split(/\s+/)[0]);
  }
  return targets;
}

/** True for links that should not be resolved against the filesystem. */
function isExternalOrAnchor(target) {
  return (
    target === '' ||
    target.startsWith('#') ||
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('//')
  );
}

function main() {
  const files = [
    ...collectMarkdown(path.join(rootDir, 'docs')),
    ...['README.md', 'CHANGELOG.md', 'RELEASING.md']
      .map(name => path.join(rootDir, name))
      .filter(fs.existsSync)
  ];

  if (files.length === 0) {
    console.log(`${Colors.YELLOW}No Markdown files found to check.${Colors.RESET}`);
    return;
  }

  const broken = [];
  let linkCount = 0;

  for (const file of files) {
    const markdown = fs.readFileSync(file, 'utf-8');
    const fileDir = path.dirname(file);

    for (const target of extractLinkTargets(markdown)) {
      if (isExternalOrAnchor(target)) {
        continue;
      }
      linkCount++;
      // Resolve relative to the file, dropping any #anchor / ?query.
      const cleanTarget = target.split('#')[0].split('?')[0];
      if (cleanTarget === '') {
        continue;
      }
      const resolved = path.resolve(fileDir, cleanTarget);
      if (!fs.existsSync(resolved)) {
        broken.push({ file: path.relative(rootDir, file), target });
      }
    }
  }

  console.log(
    `${Colors.BOLD}Checked ${linkCount} relative link(s) across ${files.length} file(s).${Colors.RESET}`
  );

  if (broken.length > 0) {
    console.error(`\n${Colors.RED}${Colors.BOLD}${broken.length} broken link(s):${Colors.RESET}`);
    for (const { file, target } of broken) {
      console.error(`${Colors.RED}  ${file} -> ${target}${Colors.RESET}`);
    }
    process.exit(1);
  }

  console.log(`${Colors.GREEN}All documentation links resolve.${Colors.RESET}`);
}

main();
