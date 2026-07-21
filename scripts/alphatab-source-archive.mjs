import { createHash } from 'node:crypto';

export const BLOCK_SIZE = 512;
export const ZERO_SHA256 = createHash('sha256').update(Buffer.alloc(0)).digest('hex');

function readString(buffer) {
  const nul = buffer.indexOf(0);
  return buffer.subarray(0, nul === -1 ? buffer.length : nul).toString('utf8');
}

function readOctal(buffer, label) {
  const value = readString(buffer).trim();
  if (value === '') return 0;
  if (!/^[0-7]+$/.test(value))
    throw new Error(`Invalid ${label} octal value: ${JSON.stringify(value)}`);
  return Number.parseInt(value, 8);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function validatePath(path) {
  if (!path || path.includes('\\') || path.includes('\0'))
    throw new Error(`Unsafe tar path: ${JSON.stringify(path)}`);
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path))
    throw new Error(`Absolute tar path: ${path}`);
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..'))
    throw new Error(`Traversal tar path: ${path}`);
}

function headerChecksum(header) {
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) {
    sum += index >= 148 && index < 156 ? 32 : header[index];
  }
  return sum;
}

export function parseTar(buffer, { allowGlobalPax = true } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('Tar input must be a Buffer');
  const members = [];
  const seen = new Set();
  let offset = 0;
  let zeroBlocks = 0;

  while (offset + BLOCK_SIZE <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += BLOCK_SIZE;
      continue;
    }
    if (zeroBlocks > 0) throw new Error(`Non-zero data follows tar terminator at byte ${offset}`);

    const storedChecksum = readOctal(header.subarray(148, 156), 'header checksum');
    const calculatedChecksum = headerChecksum(header);
    if (storedChecksum !== calculatedChecksum) {
      throw new Error(
        `Tar header checksum mismatch at byte ${offset}: ${storedChecksum} != ${calculatedChecksum}`,
      );
    }

    const name = readString(header.subarray(0, 100));
    const prefix = readString(header.subarray(345, 500));
    const path = prefix ? `${prefix}/${name}` : name;
    validatePath(path);
    if (seen.has(path)) throw new Error(`Duplicate tar member: ${path}`);
    seen.add(path);

    const typeFlag = String.fromCharCode(header[156] || 48);
    const type =
      typeFlag === '0' || typeFlag === '\0'
        ? 'file'
        : typeFlag === '5'
          ? 'directory'
          : typeFlag === 'g' && allowGlobalPax
            ? 'global-pax'
            : null;
    if (!type) {
      const reason =
        typeFlag === '1' || typeFlag === '2' ? 'link' : `type ${JSON.stringify(typeFlag)}`;
      throw new Error(`Unsupported ${reason} tar member: ${path}`);
    }

    const size = readOctal(header.subarray(124, 136), 'member size');
    const mode = readOctal(header.subarray(100, 108), 'member mode');
    const dataOffset = offset + BLOCK_SIZE;
    const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    const recordEnd = dataOffset + paddedSize;
    if (!Number.isSafeInteger(size) || recordEnd > buffer.length)
      throw new Error(`Truncated tar member: ${path}`);
    if (type === 'directory' && size !== 0)
      throw new Error(`Directory tar member has data: ${path}`);

    const data = buffer.subarray(dataOffset, dataOffset + size);
    members.push({
      path,
      type,
      typeFlag,
      mode: mode.toString(8).padStart(4, '0'),
      size,
      sha256: sha256(data),
      offset,
      recordEnd,
      raw: buffer.subarray(offset, recordEnd),
    });
    offset = recordEnd;
  }

  if (zeroBlocks < 2) throw new Error('Tar archive is missing its two-block terminator');
  if (buffer.subarray(offset).some((byte) => byte !== 0))
    throw new Error('Tar archive has non-zero trailing bytes');
  return members;
}

export function canonicalMember(member) {
  return {
    path: member.path,
    type: member.type,
    mode: member.mode,
    size: member.size,
    sha256: member.sha256,
  };
}

export function buildFilteredTar(original, members) {
  return Buffer.concat([...members.map((member) => member.raw), Buffer.alloc(BLOCK_SIZE * 2)]);
}

export function isExcludedPath(path, prefixes) {
  return prefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

export function isOpaqueArchivePath(path) {
  return /\.(?:7z|bz2|cab|gz|rar|tar|tgz|txz|xz|zip)$/i.test(path);
}

export function isAudioOrBankPath(path) {
  return (
    /(?:^|\/)sonivox(?:\/|$)/i.test(path) ||
    /(?:^|\/)test-data\/audio(?:\/|$)/i.test(path) ||
    /\.(?:aac|aif|aiff|flac|m4a|mp3|ogg|opus|pcm|sf2|sf3|wav)$/i.test(path)
  );
}

export function sha256Buffer(buffer) {
  return sha256(buffer);
}
