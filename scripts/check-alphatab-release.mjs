import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(
  repositoryRoot,
  'docs/release/provenance/alphatab-1.8.4-license-audit-baseline.json',
);
const packageLockPath = path.join(repositoryRoot, 'package-lock.json');
const publicRoot = path.join(repositoryRoot, 'public');
const artifactArgument = process.argv.find((argument) => argument.startsWith('--artifact-dir='));
const artifactRoot = artifactArgument
  ? path.resolve(repositoryRoot, artifactArgument.slice('--artifact-dir='.length))
  : path.join(repositoryRoot, 'dist');

const requiredHostedFiles = [
  'open-source/alphatab-1.8.4/source-manifest.json',
  'open-source/alphatab-1.8.4/alphatab-1.8.4-source.tar',
  'open-source/alphatab-1.8.4/LICENSE-MPL-2.0.txt',
  'open-source/alphatab-1.8.4/ALPHATAB-NOTICE.md',
  'open-source/alphatab-1.8.4/THIRD_PARTY_NOTICES.txt',
  'open-source/alphatab-1.8.4/SBOM.json',
  'open-source/alphatab-1.8.4/Bravura-OFL.txt',
  'open-source/alphatab-1.8.4/Bravura-FONTLOG.txt',
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function isNonemptyFile(filePath) {
  try {
    const metadata = await stat(filePath);
    return metadata.isFile() && metadata.size > 0;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function listFiles(root) {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

const [baseline, packageLock] = await Promise.all([
  readFile(baselinePath, 'utf8').then(JSON.parse),
  readFile(packageLockPath, 'utf8').then(JSON.parse),
]);

const alphaTabLockEntry = packageLock.packages?.['node_modules/@coderline/alphatab'];
const auditedBanks = baseline.alphaTab.assets.filter((asset) =>
  /sonivox\.(sf2|sf3)$/i.test(asset.path),
);
const forbiddenHashes = new Set(auditedBanks.map((asset) => asset.sha256));
const scannedRoots = [...new Set([publicRoot, artifactRoot])];
const scannedFiles = (await Promise.all(scannedRoots.map(listFiles))).flat();
const violations = [];

for (const filePath of scannedFiles) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  if (/\.(sf2|sf3)$/.test(normalized) || normalized.includes('sonivox')) {
    violations.push(
      `unreviewed or forbidden sound-bank artifact: ${path.relative(repositoryRoot, filePath)}`,
    );
  }
  if (forbiddenHashes.has(await sha256(filePath))) {
    violations.push(
      `audited SONiVOX bytes under another name: ${path.relative(repositoryRoot, filePath)}`,
    );
  }
}

if (alphaTabLockEntry) {
  if (alphaTabLockEntry.version !== '1.8.4') {
    violations.push(
      `alphaTab version must be 1.8.4, found ${alphaTabLockEntry.version ?? 'unknown'}`,
    );
  }
  if (alphaTabLockEntry.integrity !== baseline.alphaTab.integrity) {
    violations.push('alphaTab lockfile integrity does not match the accepted baseline');
  }

  if (!(await exists(artifactRoot))) {
    violations.push(
      `built artifact directory is required when alphaTab is installed: ${artifactRoot}`,
    );
  } else {
    for (const relativePath of requiredHostedFiles) {
      if (!(await isNonemptyFile(path.join(artifactRoot, relativePath)))) {
        violations.push(`missing or empty hosted alphaTab compliance file: ${relativePath}`);
      }
    }

    const hostedRoot = path.join(artifactRoot, 'open-source/alphatab-1.8.4');
    const sourceManifestPath = path.join(hostedRoot, 'source-manifest.json');
    const sourceArchivePath = path.join(hostedRoot, 'alphatab-1.8.4-source.tar');
    if ((await isNonemptyFile(sourceManifestPath)) && (await isNonemptyFile(sourceArchivePath))) {
      const sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
      const expectedManifest = {
        package: baseline.alphaTab.spec,
        commit: baseline.alphaTab.gitHead,
        sourceUrl: '/open-source/alphatab-1.8.4/alphatab-1.8.4-source.tar',
        sourceArchive: 'alphatab-1.8.4-source.tar',
        sourceBytes: baseline.alphaTab.source.archiveBytes,
        sourceSha256: baseline.alphaTab.source.archiveSha256,
        modified: false,
      };
      for (const [key, expectedValue] of Object.entries(expectedManifest)) {
        if (sourceManifest[key] !== expectedValue) {
          violations.push(`source manifest ${key} must equal ${JSON.stringify(expectedValue)}`);
        }
      }
      const sourceArchiveMetadata = await stat(sourceArchivePath);
      if (sourceArchiveMetadata.size !== baseline.alphaTab.source.archiveBytes) {
        violations.push('hosted alphaTab source archive byte count does not match the baseline');
      }
      if ((await sha256(sourceArchivePath)) !== baseline.alphaTab.source.archiveSha256) {
        violations.push('hosted alphaTab source archive hash does not match the baseline');
      }
    }

    const noticePath = path.join(hostedRoot, 'ALPHATAB-NOTICE.md');
    if (await isNonemptyFile(noticePath)) {
      const notice = await readFile(noticePath, 'utf8');
      if (/\[[A-Z][A-Z0-9_ |—-]*\]/u.test(notice)) {
        violations.push('hosted alphaTab notice still contains template placeholders');
      }
      for (const requiredValue of [
        baseline.alphaTab.gitHead,
        baseline.alphaTab.source.archiveSha256,
        '/open-source/alphatab-1.8.4/alphatab-1.8.4-source.tar',
      ]) {
        if (!notice.includes(requiredValue)) {
          violations.push(`hosted alphaTab notice is missing ${requiredValue}`);
        }
      }
    }

    const mplPath = path.join(hostedRoot, 'LICENSE-MPL-2.0.txt');
    if (
      (await isNonemptyFile(mplPath)) &&
      !(await readFile(mplPath, 'utf8')).includes('Mozilla Public License Version 2.0')
    ) {
      violations.push('hosted MPL file does not identify Mozilla Public License Version 2.0');
    }

    const embeddedNames = [
      '@coderline/alphatab',
      'TinySoundFont',
      'SFZero',
      'Haxe',
      'SharpZipLib',
      'NVorbis',
      'libvorbis',
      'Bravura',
    ];
    for (const relativePath of ['THIRD_PARTY_NOTICES.txt', 'SBOM.json']) {
      const hostedPath = path.join(hostedRoot, relativePath);
      if (await isNonemptyFile(hostedPath)) {
        const contents = await readFile(hostedPath, 'utf8');
        if (relativePath === 'SBOM.json') JSON.parse(contents);
        for (const name of embeddedNames) {
          if (!contents.includes(name)) {
            violations.push(`${relativePath} is missing embedded component ${name}`);
          }
        }
      }
    }

    const bravuraOflPath = path.join(hostedRoot, 'Bravura-OFL.txt');
    if (
      (await isNonemptyFile(bravuraOflPath)) &&
      !(await readFile(bravuraOflPath, 'utf8')).includes('SIL OPEN FONT LICENSE Version 1.1')
    ) {
      violations.push('hosted Bravura license file does not identify SIL Open Font License 1.1');
    }
    const bravuraFontlogPath = path.join(hostedRoot, 'Bravura-FONTLOG.txt');
    if (await isNonemptyFile(bravuraFontlogPath)) {
      const fontlog = await readFile(bravuraFontlogPath, 'utf8');
      if (!fontlog.includes('Bravura') || !fontlog.includes('1.38')) {
        violations.push('hosted Bravura FONTLOG does not identify exact Bravura 1.38');
      }
    }

    const allowedBravuraHashes = new Set(
      baseline.alphaTab.assets
        .filter((asset) => /bravura\.(?:eot|otf|svg|woff2?)$/i.test(asset.path))
        .map((asset) => asset.sha256),
    );
    for (const filePath of scannedFiles.filter((candidate) =>
      /bravura.*\.(?:eot|otf|svg|woff2?)$/i.test(path.basename(candidate)),
    )) {
      if (!allowedBravuraHashes.has(await sha256(filePath))) {
        violations.push(`Bravura asset is not an accepted exact 1.38 file: ${filePath}`);
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`alphaTab release-policy check failed:\n- ${violations.join('\n- ')}`);
}

process.stdout.write(
  alphaTabLockEntry
    ? `alphaTab ${alphaTabLockEntry.version} hosted compliance content and sound-bank exclusions passed.\n`
    : 'alphaTab is not installed; sound-bank exclusion scan passed.\n',
);
