import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { format } from 'prettier';
import {
  buildFilteredTar,
  canonicalMember,
  isExcludedPath,
  parseTar,
  sha256Buffer,
} from './alphatab-source-archive.mjs';

const root = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(
  root,
  'docs/release/provenance/alphatab-1.8.4-license-audit-baseline.json',
);
const outputDir = path.join(root, 'public/open-source/alphatab-1.8.4');
const sourceArchiveName = 'alphatab-1.8.4-source.tar';
const memberManifestName = 'source-members.json';
const inputArgument = process.argv.find((argument) => argument.startsWith('--input='));
const inputPath = path.resolve(
  root,
  inputArgument?.slice('--input='.length) ?? '.local/alphatab-1.8.4-source.tar',
);
const excludedPrefixes = ['packages/alphatab/font/sonivox/', 'packages/alphatab/test-data/audio/'];
const jsonFormat = { parser: 'json', printWidth: 100, tabWidth: 2, endOfLine: 'lf' };

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const original = await readFile(inputPath);
const received = baseline.alphaTab.source.receivedArchive;
if (original.length !== received.bytes || sha256Buffer(original) !== received.sha256) {
  throw new Error(`Input is not the approved received archive: ${inputPath}`);
}

const allMembers = parseTar(original);
for (const expectedMember of [
  {
    path: baseline.alphaTab.source.lockfilePath,
    bytes: baseline.alphaTab.source.lockfileBytes,
    sha256: baseline.alphaTab.source.lockfileSha256,
  },
  baseline.alphaTab.source.license,
]) {
  const member = allMembers.find((candidate) => candidate.path === expectedMember.path);
  if (!member || member.size !== expectedMember.bytes || member.sha256 !== expectedMember.sha256) {
    throw new Error(`Received archive member does not match baseline: ${expectedMember.path}`);
  }
}
const excludedMembers = allMembers.filter((member) =>
  isExcludedPath(member.path, excludedPrefixes),
);
const distributedMembers = allMembers.filter(
  (member) => !isExcludedPath(member.path, excludedPrefixes),
);
if (excludedMembers.length === 0) throw new Error('Sanitization matched no members');
for (const prefix of excludedPrefixes) {
  if (!excludedMembers.some((member) => member.path.startsWith(prefix)))
    throw new Error(`No excluded member under ${prefix}`);
}

const sanitizedArchive = buildFilteredTar(original, distributedMembers);
const memberManifest = {
  schema: 'stringsight-alphatab-source-members/v1',
  package: baseline.alphaTab.spec,
  upstream: {
    repository: baseline.alphaTab.source.repository,
    commit: baseline.alphaTab.tagCommit,
    tree: baseline.alphaTab.source.tree,
    receivedArchiveBytes: received.bytes,
    receivedArchiveSha256: received.sha256,
  },
  sanitization: {
    policy: 'exclude-non-source-audio/v1',
    excludedPrefixes,
    excludedMemberCount: excludedMembers.length,
    excludedMembers: excludedMembers.map(canonicalMember),
  },
  distributedMemberCount: distributedMembers.length,
  members: distributedMembers.map(canonicalMember),
};
const memberManifestBytes = Buffer.from(await format(JSON.stringify(memberManifest), jsonFormat));
const sourceManifest = {
  schema: 'stringsight-alphatab-source-release/v2',
  package: baseline.alphaTab.spec,
  commit: baseline.alphaTab.tagCommit,
  tree: baseline.alphaTab.source.tree,
  sourceUrl: `/open-source/alphatab-1.8.4/${sourceArchiveName}`,
  sourceArchive: sourceArchiveName,
  sourceBytes: sanitizedArchive.length,
  sourceSha256: sha256Buffer(sanitizedArchive),
  memberManifest: memberManifestName,
  memberManifestSha256: sha256Buffer(memberManifestBytes),
  coveredSoftwareModified: false,
  sourcePackagingSanitized: true,
  excludedPrefixes,
  excludedMemberCount: excludedMembers.length,
  receivedArchiveProvenance: {
    bytes: received.bytes,
    sha256: received.sha256,
  },
  postDeployVerification: {
    status: 'gated',
    immutableHostedUrl: null,
    fetchedBytes: null,
    fetchedSha256: null,
    memberManifestSha256: null,
    verifiedAt: null,
  },
};
const expected = baseline.alphaTab.source.sanitizedArchive;
if (expected) {
  const actual = {
    bytes: sanitizedArchive.length,
    sha256: sourceManifest.sourceSha256,
    memberManifestSha256: sourceManifest.memberManifestSha256,
    excludedMemberCount: excludedMembers.length,
  };
  for (const [key, value] of Object.entries(actual)) {
    if (expected[key] !== value)
      throw new Error(`Generated ${key} ${value} does not match baseline ${expected[key]}`);
  }
  if (
    expected.receivedMemberCount !== allMembers.length ||
    expected.distributedMemberCount !== distributedMembers.length
  ) {
    throw new Error('Generated archive member counts do not match the baseline');
  }
}

await writeFile(path.join(outputDir, sourceArchiveName), sanitizedArchive);
await writeFile(path.join(outputDir, memberManifestName), memberManifestBytes);
await writeFile(
  path.join(outputDir, 'source-manifest.json'),
  await format(JSON.stringify(sourceManifest), jsonFormat),
);
const licenseMember = allMembers.find(
  (member) => member.path === baseline.alphaTab.source.license.path,
);
await writeFile(
  path.join(outputDir, 'LICENSE-MPL-2.0.txt'),
  licenseMember.raw.subarray(512, 512 + licenseMember.size),
);

process.stdout.write(
  `${JSON.stringify(
    {
      input: path.relative(root, inputPath).replaceAll('\\', '/'),
      receivedBytes: original.length,
      receivedSha256: received.sha256,
      excludedMemberCount: excludedMembers.length,
      distributedMemberCount: distributedMembers.length,
      sourceBytes: sanitizedArchive.length,
      sourceSha256: sourceManifest.sourceSha256,
      memberManifestSha256: sourceManifest.memberManifestSha256,
    },
    null,
    2,
  )}\n`,
);
