import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const notices = await readFile(new URL('THIRD_PARTY_NOTICES.md', root), 'utf8');
const distributedNotices = await readFile(new URL('public/THIRD_PARTY_LICENSES.txt', root), 'utf8');
const modelInventory = await readFile(new URL('public/models/README.md', root), 'utf8');
const alphaTabBaseline = JSON.parse(
  await readFile(
    new URL('docs/release/provenance/alphatab-1.8.4-license-audit-baseline.json', root),
    'utf8',
  ),
);

const permittedProductionLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
]);

const installedPackages = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith('node_modules/'))
  .map(([path, metadata]) => ({
    dev: metadata.dev === true,
    integrity: metadata.integrity,
    license: metadata.license,
    name: path.slice('node_modules/'.length),
    version: metadata.version,
  }));

const missingLicenseMetadata = installedPackages.filter(
  ({ license, version }) => typeof license !== 'string' || typeof version !== 'string',
);
if (missingLicenseMetadata.length > 0) {
  throw new Error(
    `Installed packages are missing license or version metadata: ${missingLicenseMetadata
      .map(({ name }) => name)
      .join(', ')}`,
  );
}

const productionPackages = installedPackages.filter(({ dev }) => !dev);
const isAcceptedProductionPackage = ({ integrity, license, name, version }) =>
  permittedProductionLicenses.has(license) ||
  (name === '@coderline/alphatab' &&
    version === '1.8.4' &&
    license === 'MPL-2.0' &&
    integrity === alphaTabBaseline.alphaTab.integrity);
const unapprovedProductionPackages = productionPackages.filter(
  (packageMetadata) => !isAcceptedProductionPackage(packageMetadata),
);
if (unapprovedProductionPackages.length > 0) {
  throw new Error(
    `Production packages require a license review: ${unapprovedProductionPackages
      .map(({ license, name, version }) => `${name}@${version} (${license})`)
      .join(', ')}`,
  );
}

const missingNoticeEntries = productionPackages.filter(
  ({ license, name, version }) =>
    !notices.includes(`### \`${name}\``) ||
    !notices.includes(`- Version: ${version}`) ||
    !notices.includes(`- License: ${license}`),
);
if (missingNoticeEntries.length > 0) {
  throw new Error(
    `THIRD_PARTY_NOTICES.md is incomplete for: ${missingNoticeEntries
      .map(({ name, version }) => `${name}@${version}`)
      .join(', ')}`,
  );
}

const missingDistributedNotices = productionPackages.filter(
  ({ license, name, version }) => !distributedNotices.includes(`${name}@${version} (${license})`),
);
if (missingDistributedNotices.length > 0) {
  throw new Error(
    `public/THIRD_PARTY_LICENSES.txt is incomplete for: ${missingDistributedNotices
      .map(({ name, version }) => `${name}@${version}`)
      .join(', ')}`,
  );
}

const modelEntries = await readdir(new URL('public/models/', root), {
  recursive: true,
  withFileTypes: true,
});
const undocumentedModelAssets = modelEntries
  .filter((entry) => entry.isFile() && entry.name !== 'README.md')
  .filter((entry) => !modelInventory.includes(`\`${entry.name}\``));
if (undocumentedModelAssets.length > 0) {
  throw new Error(
    `Model assets are missing inventory records: ${undocumentedModelAssets
      .map(({ name }) => name)
      .join(', ')}`,
  );
}

console.log(
  `License policy covers ${productionPackages.length} production packages and ` +
    `${installedPackages.length - productionPackages.length} development packages.`,
);
