import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set([
  '.git',
  '.local',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const stalePhrases = [
  'Proposed architecture research; raw spike evidence pending',
  'Next, create a separate disposable spike branch',
];
const mojibakePatterns = [/â€[™œ“”¦]/u, /Â[ ©®°]/u, /ï¿½/u, /�/u];
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files;
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

const markdownFiles = await walk(repositoryRoot);

for (const filePath of markdownFiles) {
  const source = await readFile(filePath, 'utf8');
  const relativeFile = path.relative(repositoryRoot, filePath);

  for (const phrase of stalePhrases) {
    if (source.includes(phrase)) failures.push(`${relativeFile}: stale phrase: ${phrase}`);
  }
  for (const pattern of mojibakePatterns) {
    if (pattern.test(source)) failures.push(`${relativeFile}: possible UTF-8 mojibake: ${pattern}`);
  }

  const links = source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of links) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#|\/)/i.test(target)) continue;
    target = decodeURIComponent(target.split('#', 1)[0].split('?', 1)[0]);
    if (!target) continue;
    if (!(await exists(path.resolve(path.dirname(filePath), target)))) {
      failures.push(`${relativeFile}: broken relative link: ${match[1]}`);
    }
  }
}

const checklist = await readFile(path.join(repositoryRoot, 'BUILD_CHECKLIST.md'), 'utf8');
const activeChecklist = checklist.split('## Superseded roadmap reference', 1)[0];
const numberedHeadings = [...activeChecklist.matchAll(/^### (\d+)\./gm)].map((match) =>
  Number(match[1]),
);
const expectedHeadings = Array.from({ length: 26 }, (_, index) => index + 1);
if (numberedHeadings.join(',') !== expectedHeadings.join(',')) {
  failures.push(`BUILD_CHECKLIST.md: active numbered order is ${numberedHeadings.join(',')}`);
}

if (failures.length > 0) {
  throw new Error(`documentation checks failed:\n- ${failures.join('\n- ')}`);
}

process.stdout.write(
  `Documentation checks passed for ${markdownFiles.length} Markdown files and Items 1-26.\n`,
);
