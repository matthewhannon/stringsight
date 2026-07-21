import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  canonicalMember,
  isAudioOrBankPath,
  isExcludedPath,
  isOpaqueArchivePath,
  parseTar,
  sha256Buffer,
} from './alphatab-source-archive.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(repositoryRoot, 'public');
const artifactArgument = process.argv.find((argument) => argument.startsWith('--artifact-dir='));
const artifactRoot = artifactArgument
  ? path.resolve(repositoryRoot, artifactArgument.slice('--artifact-dir='.length))
  : path.join(repositoryRoot, 'dist');
const baselinePath = path.join(
  repositoryRoot,
  'docs/release/provenance/alphatab-1.8.4-license-audit-baseline.json',
);
const hostedRelativeRoot = 'open-source/alphatab-1.8.4';
const legalUrl = `/${hostedRelativeRoot}/ALPHATAB-NOTICE.md`;
const requiredHostedFiles = [
  'source-manifest.json',
  'source-members.json',
  'alphatab-1.8.4-source.tar',
  'LICENSE-MPL-2.0.txt',
  'ALPHATAB-NOTICE.md',
  'THIRD_PARTY_NOTICES.txt',
  'SBOM.json',
  'Bravura-OFL.txt',
  'Bravura-FONTLOG.txt',
];
const exactResolved = 'https://registry.npmjs.org/@coderline/alphatab/-/alphatab-1.8.4.tgz';
const componentExpectations = [
  ['@coderline/alphatab', '1.8.4', 'MPL-2.0'],
  ['TinySoundFont', null, 'MIT'],
  ['SFZero', null, 'MIT'],
  ['Haxe Standard Library', null, 'MIT'],
  ['SharpZipLib', null, 'MIT'],
  ['NVorbis', null, 'MIT'],
  ['libvorbis', null, 'BSD-3-Clause'],
  ['Bravura', '1.38', 'OFL-1.1'],
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

async function listFiles(root) {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function fileSha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function relative(filePath) {
  return path.relative(repositoryRoot, filePath).replaceAll('\\', '/');
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const [baseline, packageJson, packageLock] = await Promise.all([
  readFile(baselinePath, 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8').then(JSON.parse),
]);
const policy = baseline.alphaTab;
const sourcePolicy = policy.source;
const sanitizedPolicy = sourcePolicy.sanitizedArchive;
const violations = [];

if (packageJson.dependencies?.['@coderline/alphatab'] !== '1.8.4') {
  violations.push('package.json must pin @coderline/alphatab exactly to "1.8.4"');
}
if (packageLock.packages?.['']?.dependencies?.['@coderline/alphatab'] !== '1.8.4') {
  violations.push('package-lock root dependency must pin @coderline/alphatab exactly to 1.8.4');
}
const lockEntry = packageLock.packages?.['node_modules/@coderline/alphatab'];
for (const [key, expected] of Object.entries({
  version: '1.8.4',
  resolved: exactResolved,
  integrity: policy.integrity,
  license: 'MPL-2.0',
})) {
  if (lockEntry?.[key] !== expected)
    violations.push(`alphaTab lock entry ${key} must equal ${JSON.stringify(expected)}`);
}

if (!(await exists(artifactRoot)))
  violations.push(`artifact directory does not exist: ${artifactRoot}`);
const hostedRoot = path.join(artifactRoot, hostedRelativeRoot);
for (const file of requiredHostedFiles) {
  const target = path.join(hostedRoot, file);
  const metadata = await stat(target).catch(() => null);
  if (!metadata?.isFile() || metadata.size === 0)
    violations.push(`missing or empty hosted compliance file: ${file}`);
}

const sourceManifestPath = path.join(hostedRoot, 'source-manifest.json');
const memberManifestPath = path.join(hostedRoot, 'source-members.json');
const sourceArchivePath = path.join(hostedRoot, 'alphatab-1.8.4-source.tar');
let sourceManifest;
let memberManifest;
let sourceMembers = [];
if (await exists(sourceManifestPath))
  sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
if (await exists(memberManifestPath))
  memberManifest = JSON.parse(await readFile(memberManifestPath, 'utf8'));
if (await exists(sourceArchivePath)) {
  try {
    sourceMembers = parseTar(await readFile(sourceArchivePath));
  } catch (error) {
    violations.push(`unsafe or malformed source archive: ${error.message}`);
  }
}

const expectedSourceManifest = {
  schema: 'stringsight-alphatab-source-release/v2',
  package: policy.spec,
  commit: policy.tagCommit,
  tree: sourcePolicy.tree,
  sourceUrl: `/${hostedRelativeRoot}/alphatab-1.8.4-source.tar`,
  sourceArchive: 'alphatab-1.8.4-source.tar',
  sourceBytes: sanitizedPolicy.bytes,
  sourceSha256: sanitizedPolicy.sha256,
  memberManifest: 'source-members.json',
  memberManifestSha256: sanitizedPolicy.memberManifestSha256,
  coveredSoftwareModified: false,
  sourcePackagingSanitized: true,
  excludedPrefixes: sanitizedPolicy.excludedPrefixes,
  excludedMemberCount: sanitizedPolicy.excludedMemberCount,
  receivedArchiveProvenance: sourcePolicy.receivedArchive,
  postDeployVerification: {
    status: 'gated',
    immutableHostedUrl: null,
    fetchedBytes: null,
    fetchedSha256: null,
    memberManifestSha256: null,
    verifiedAt: null,
  },
};
if (sourceManifest && !equalJson(sourceManifest, expectedSourceManifest)) {
  violations.push(
    'source-manifest.json is incomplete or differs from the canonical release manifest',
  );
}
if (await exists(sourceArchivePath)) {
  const archiveBytes = await readFile(sourceArchivePath);
  if (archiveBytes.length !== sanitizedPolicy.bytes)
    violations.push('sanitized source archive byte count mismatch');
  if (sha256Buffer(archiveBytes) !== sanitizedPolicy.sha256)
    violations.push('sanitized source archive hash mismatch');
}
if (
  (await exists(memberManifestPath)) &&
  (await fileSha256(memberManifestPath)) !== sanitizedPolicy.memberManifestSha256
) {
  violations.push('source member manifest hash mismatch');
}

if (memberManifest) {
  if (memberManifest.schema !== 'stringsight-alphatab-source-members/v1')
    violations.push('source member manifest schema mismatch');
  if (memberManifest.package !== policy.spec)
    violations.push('source member manifest package mismatch');
  if (
    !equalJson(memberManifest.upstream, {
      repository: sourcePolicy.repository,
      commit: policy.tagCommit,
      tree: sourcePolicy.tree,
      receivedArchiveBytes: sourcePolicy.receivedArchive.bytes,
      receivedArchiveSha256: sourcePolicy.receivedArchive.sha256,
    })
  )
    violations.push('source member manifest upstream provenance mismatch');
  if (!equalJson(memberManifest.sanitization?.excludedPrefixes, sanitizedPolicy.excludedPrefixes)) {
    violations.push('source member manifest exclusion prefixes differ from policy');
  }
  if (memberManifest.sanitization?.policy !== 'exclude-non-source-audio/v1')
    violations.push('source member manifest sanitization policy mismatch');
  const excluded = memberManifest.sanitization?.excludedMembers;
  if (!Array.isArray(excluded) || excluded.length !== sanitizedPolicy.excludedMemberCount) {
    violations.push('source member manifest excluded-member list is incomplete');
  } else {
    const excludedPaths = new Set();
    for (const member of excluded) {
      if (!member?.path || excludedPaths.has(member.path))
        violations.push(`duplicate or invalid excluded member: ${member?.path}`);
      excludedPaths.add(member.path);
      if (!isExcludedPath(member.path, sanitizedPolicy.excludedPrefixes))
        violations.push(`undeclared exclusion: ${member.path}`);
      for (const key of ['path', 'type', 'mode', 'size', 'sha256']) {
        if (!(key in member)) violations.push(`excluded member lacks ${key}: ${member.path}`);
      }
    }
  }
  if (memberManifest.distributedMemberCount !== sanitizedPolicy.distributedMemberCount) {
    violations.push('source member manifest distributed-member count mismatch');
  }
  if (
    memberManifest.distributedMemberCount + memberManifest.sanitization?.excludedMemberCount !==
    sanitizedPolicy.receivedMemberCount
  ) {
    violations.push('source member manifest does not account for every received archive member');
  }
  if (
    !Array.isArray(memberManifest.members) ||
    memberManifest.members.length !== sanitizedPolicy.distributedMemberCount
  ) {
    violations.push('source member manifest distributed-member list is incomplete');
  } else if (!equalJson(memberManifest.members, sourceMembers.map(canonicalMember))) {
    violations.push('source archive members do not exactly match the canonical member manifest');
  }
}

for (const member of sourceMembers) {
  if (
    isExcludedPath(member.path, sanitizedPolicy.excludedPrefixes) ||
    isAudioOrBankPath(member.path)
  ) {
    violations.push(`forbidden bank/audio archive member: ${member.path}`);
  }
  if (isOpaqueArchivePath(member.path))
    violations.push(`nested opaque archive member is forbidden: ${member.path}`);
}

const excludedHashes = new Set([
  ...policy.assets
    .filter((asset) => /sonivox\.(?:sf2|sf3)$/i.test(asset.path))
    .map((asset) => asset.sha256),
  ...(memberManifest?.sanitization?.excludedMembers ?? [])
    .filter((member) => member.type === 'file' && member.size > 0)
    .map((member) => member.sha256),
]);
const scannedRoots = [...new Set([publicRoot, artifactRoot])];
const scannedFiles = (await Promise.all(scannedRoots.map(listFiles))).flat();
const allowedSourceArchives = new Set(
  scannedRoots.map((root) => path.resolve(root, hostedRelativeRoot, 'alphatab-1.8.4-source.tar')),
);
for (const filePath of scannedFiles) {
  const normalized = relative(filePath).toLowerCase();
  if (isAudioOrBankPath(normalized))
    violations.push(`forbidden bank/audio artifact: ${relative(filePath)}`);
  if (isOpaqueArchivePath(normalized) && !allowedSourceArchives.has(path.resolve(filePath))) {
    violations.push(`opaque release archive is not permitted: ${relative(filePath)}`);
  }
  if (excludedHashes.has(await fileSha256(filePath)))
    violations.push(`excluded source bytes redistributed as ${relative(filePath)}`);
}

const exactHostedFiles = [
  ['LICENSE-MPL-2.0.txt', sourcePolicy.license],
  [
    'Bravura-OFL.txt',
    {
      bytes: 4514,
      sha256: '8e76ea7651b265bd047d192a4a796c25bbc904759a2fa9ee7bb9dba958a61158',
    },
  ],
  [
    'Bravura-FONTLOG.txt',
    {
      bytes: 42699,
      sha256: '74efb41953752770bd881f91c88268d33090b3da997ad4824a14969b4215bae1',
    },
  ],
];
for (const [file, expected] of exactHostedFiles) {
  const target = path.join(hostedRoot, file);
  if (await exists(target)) {
    const metadata = await stat(target);
    if (metadata.size !== expected.bytes || (await fileSha256(target)) !== expected.sha256) {
      violations.push(`${file} is not the exact accepted upstream file`);
    }
  }
}
const bravuraAsset = path.join(artifactRoot, 'font/Bravura.woff2');
const expectedBravura = policy.assets.find((asset) => asset.path === 'dist/font/Bravura.woff2');
if (!(await exists(bravuraAsset))) {
  violations.push('hosted Bravura.woff2 is missing');
} else if (
  (await stat(bravuraAsset)).size !== expectedBravura.bytes ||
  (await fileSha256(bravuraAsset)) !== expectedBravura.sha256
) {
  violations.push('hosted Bravura.woff2 is not the exact accepted upstream asset');
}

const noticePath = path.join(hostedRoot, 'ALPHATAB-NOTICE.md');
if (await exists(noticePath)) {
  const notice = await readFile(noticePath, 'utf8');
  for (const value of [
    policy.tagCommit,
    sanitizedPolicy.sha256,
    sourcePolicy.receivedArchive.sha256,
    legalUrl.replace('ALPHATAB-NOTICE.md', 'alphatab-1.8.4-source.tar'),
  ]) {
    if (!notice.includes(value)) violations.push(`ALPHATAB-NOTICE.md is missing ${value}`);
  }
  if (
    !notice.includes('Status: GATED') ||
    !notice.includes('immutable hosted URL') ||
    !notice.includes('fetched byte count') ||
    !notice.includes('fetched SHA-256')
  ) {
    violations.push(
      'ALPHATAB-NOTICE.md does not state the post-deploy verification gates explicitly',
    );
  }
  if (/\[(?:TODO|TBD|INSERT|PENDING)[^\]]*\]/i.test(notice))
    violations.push('ALPHATAB-NOTICE.md contains a template placeholder');
}

const noticesPath = path.join(hostedRoot, 'THIRD_PARTY_NOTICES.txt');
if (await exists(noticesPath)) {
  const notices = await readFile(noticesPath, 'utf8');
  for (const [name] of componentExpectations)
    if (!notices.includes(name)) violations.push(`THIRD_PARTY_NOTICES.txt is missing ${name}`);
}

const sbomPath = path.join(hostedRoot, 'SBOM.json');
if (await exists(sbomPath)) {
  const sbom = JSON.parse(await readFile(sbomPath, 'utf8'));
  if (sbom.schema !== 'stringsight-alphatab-sbom/v2') violations.push('SBOM schema must be v2');
  if (
    !equalJson(sbom.sourceDistribution, {
      archive: `/${hostedRelativeRoot}/alphatab-1.8.4-source.tar`,
      bytes: sanitizedPolicy.bytes,
      sha256: sanitizedPolicy.sha256,
      memberManifest: `/${hostedRelativeRoot}/source-members.json`,
      memberManifestSha256: sanitizedPolicy.memberManifestSha256,
      excludedPrefixes: sanitizedPolicy.excludedPrefixes,
      excludedMemberCount: sanitizedPolicy.excludedMemberCount,
    })
  )
    violations.push('SBOM sourceDistribution is incomplete or inaccurate');
  if (
    !equalJson(sbom.runtimeAudioPolicy, {
      playerMode: 'PlayerMode.Disabled',
      soundFont: null,
      soundBanksDistributed: false,
    })
  ) {
    violations.push('SBOM runtimeAudioPolicy is incomplete or inaccurate');
  }
  for (const [name, version, license] of componentExpectations) {
    const component = sbom.components?.find((candidate) => candidate.name === name);
    if (
      !component ||
      component.license !== license ||
      (version !== null && component.version !== version)
    ) {
      violations.push(`SBOM component is missing or inaccurate: ${name}`);
    }
  }
}

let legalLinkFound = false;
const artifactTextFiles = (await listFiles(artifactRoot)).filter((file) =>
  /\.(?:html|js|mjs|cjs)$/i.test(file),
);
for (const file of artifactTextFiles) {
  if ((await readFile(file, 'utf8')).includes(legalUrl)) legalLinkFound = true;
}
if (!legalLinkFound && path.resolve(artifactRoot) === path.resolve(publicRoot)) {
  const sourceFiles = (await listFiles(path.join(repositoryRoot, 'src'))).filter((file) =>
    /\.(?:ts|tsx|js|jsx)$/i.test(file),
  );
  for (const file of sourceFiles)
    if ((await readFile(file, 'utf8')).includes(legalUrl)) legalLinkFound = true;
}
if (!legalLinkFound)
  violations.push(`final legal link target is not referenced by the artifact: ${legalUrl}`);

if (violations.length)
  throw new Error(
    `alphaTab release-policy check failed:\n- ${[...new Set(violations)].join('\n- ')}`,
  );
process.stdout.write(
  `alphaTab 1.8.4 release policy passed for ${relative(artifactRoot)}: ${sourceMembers.length} source members, ${sanitizedPolicy.excludedMemberCount} declared exclusions, no bank/audio payloads.\n`,
);
