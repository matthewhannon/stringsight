export const CANONICAL_JSON_VERSION = 'stringsight-canonical-json/v1' as const;
export const CANONICAL_HASH_ALGORITHM = 'sha-256' as const;

export const CANONICAL_JSON_LIMITS = Object.freeze({
  maximumArrayLength: 50_000,
  maximumDepth: 64,
  maximumKeyCodeUnits: 1_024,
  // PracticeDocument v1's schema-maximal qualified content projection is bounded at 313,200
  // nodes: 184,936 map nodes, 122,193 track/event/note/semantic nodes, and 6,071 other
  // document/envelope nodes. Keep modest headroom without making serialization unbounded.
  maximumNodes: 350_000,
  maximumObjectProperties: 10_000,
  maximumQualifierCodeUnits: 160,
  maximumStringCodeUnits: 1_000_000,
} as const);

export type CanonicalJsonErrorCode =
  | 'ACCESSOR_PROPERTY'
  | 'CYCLIC_REFERENCE'
  | 'INVALID_QUALIFIER'
  | 'MAXIMUM_ARRAY_LENGTH'
  | 'MAXIMUM_DEPTH'
  | 'MAXIMUM_KEY_LENGTH'
  | 'MAXIMUM_NODE_COUNT'
  | 'MAXIMUM_OBJECT_PROPERTIES'
  | 'MAXIMUM_QUALIFIER_LENGTH'
  | 'MAXIMUM_STRING_LENGTH'
  | 'NON_ENUMERABLE_PROPERTY'
  | 'NON_FINITE_NUMBER'
  | 'NON_INDEX_ARRAY_PROPERTY'
  | 'NON_PLAIN_OBJECT'
  | 'SYMBOL_PROPERTY'
  | 'UNSUPPORTED_TYPE';

export class CanonicalJsonError extends TypeError {
  readonly code: CanonicalJsonErrorCode;
  readonly path: string;

  constructor(code: CanonicalJsonErrorCode, path: string, reason: string) {
    super(`[${code}] Value at ${path} is not canonical JSON: ${reason}.`);
    this.name = 'CanonicalJsonError';
    this.code = code;
    this.path = path;
  }
}

export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export type CanonicalJsonQualification = Readonly<{
  schemaVersion: string;
  projectionVersion: string;
}>;

export type QualifiedContentHash = Readonly<{
  algorithm: typeof CANONICAL_HASH_ALGORITHM;
  canonicalizationVersion: typeof CANONICAL_JSON_VERSION;
  schemaVersion: string;
  projectionVersion: string;
  digestHex: string;
}>;

type QualifiedHashEnvelope = Readonly<{
  canonicalizationVersion: typeof CANONICAL_JSON_VERSION;
  schemaVersion: string;
  projectionVersion: string;
  value: unknown;
}>;

type SerializationState = {
  ancestors: Set<object>;
  nodes: number;
};

const objectPrototype = Object.prototype;

const pointerSegment = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const childPath = (path: string, key: string | number): string =>
  `${path}/${pointerSegment(String(key))}`;

const fail = (code: CanonicalJsonErrorCode, path: string, reason: string): never => {
  throw new CanonicalJsonError(code, path, reason);
};

const assertKeyLength = (key: string, path: string): void => {
  if (key.length > CANONICAL_JSON_LIMITS.maximumKeyCodeUnits) {
    fail(
      'MAXIMUM_KEY_LENGTH',
      path,
      `object keys must not exceed ${String(CANONICAL_JSON_LIMITS.maximumKeyCodeUnits)} UTF-16 code units`,
    );
  }
};

const assertDataProperty = (
  descriptor: PropertyDescriptor | undefined,
  path: string,
): PropertyDescriptor => {
  if (descriptor === undefined || !('value' in descriptor)) {
    return fail('ACCESSOR_PROPERTY', path, 'accessor properties are not supported');
  }
  if (descriptor.enumerable !== true) {
    return fail('NON_ENUMERABLE_PROPERTY', path, 'non-enumerable properties are not supported');
  }
  return descriptor;
};

const serializeNumber = (value: number, path: string): string => {
  if (!Number.isFinite(value)) {
    return fail('NON_FINITE_NUMBER', path, 'numbers must be finite');
  }
  return Object.is(value, -0) ? '0' : String(value);
};

const serializeArray = (
  value: readonly unknown[],
  path: string,
  state: SerializationState,
  depth: number,
): string => {
  if (value.length > CANONICAL_JSON_LIMITS.maximumArrayLength) {
    return fail(
      'MAXIMUM_ARRAY_LENGTH',
      path,
      `arrays must not exceed ${String(CANONICAL_JSON_LIMITS.maximumArrayLength)} entries`,
    );
  }
  const ownKeys = Reflect.ownKeys(value);
  const expectedKeys = new Set<PropertyKey>(['length']);
  for (let index = 0; index < value.length; index += 1) {
    expectedKeys.add(String(index));
  }

  for (const key of ownKeys) {
    if (typeof key === 'symbol') {
      return fail('SYMBOL_PROPERTY', path, 'symbol properties are not supported');
    }
    if (!expectedKeys.has(key)) {
      assertKeyLength(key, path);
      return fail(
        'NON_INDEX_ARRAY_PROPERTY',
        childPath(path, key),
        'non-index array properties are not supported',
      );
    }
  }

  const entries: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = childPath(path, index);
    const descriptor = assertDataProperty(
      Object.getOwnPropertyDescriptor(value, String(index)),
      itemPath,
    );
    entries.push(serialize(descriptor.value, itemPath, state, depth + 1));
  }
  return `[${entries.join(',')}]`;
};

const serializeObject = (
  value: object,
  path: string,
  state: SerializationState,
  depth: number,
): string => {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== objectPrototype && prototype !== null) {
    return fail('NON_PLAIN_OBJECT', path, 'only plain objects are supported');
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    return fail('SYMBOL_PROPERTY', path, 'symbol properties are not supported');
  }
  if (ownKeys.length > CANONICAL_JSON_LIMITS.maximumObjectProperties) {
    return fail(
      'MAXIMUM_OBJECT_PROPERTIES',
      path,
      `objects must not exceed ${String(CANONICAL_JSON_LIMITS.maximumObjectProperties)} properties`,
    );
  }

  const keys = (ownKeys as string[]).sort();
  const entries = keys.map((key) => {
    assertKeyLength(key, path);
    const propertyPath = childPath(path, key);
    const descriptor = assertDataProperty(
      Object.getOwnPropertyDescriptor(value, key),
      propertyPath,
    );
    return `${JSON.stringify(key)}:${serialize(descriptor.value, propertyPath, state, depth + 1)}`;
  });
  return `{${entries.join(',')}}`;
};

const serialize = (
  value: unknown,
  path: string,
  state: SerializationState,
  depth: number,
): string => {
  if (depth > CANONICAL_JSON_LIMITS.maximumDepth) {
    return fail(
      'MAXIMUM_DEPTH',
      path,
      `nesting must not exceed ${String(CANONICAL_JSON_LIMITS.maximumDepth)} levels`,
    );
  }
  state.nodes += 1;
  if (state.nodes > CANONICAL_JSON_LIMITS.maximumNodes) {
    return fail(
      'MAXIMUM_NODE_COUNT',
      path,
      `values must not exceed ${String(CANONICAL_JSON_LIMITS.maximumNodes)} nodes`,
    );
  }
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serializeNumber(value, path);
    case 'string':
      if (value.length > CANONICAL_JSON_LIMITS.maximumStringCodeUnits) {
        return fail(
          'MAXIMUM_STRING_LENGTH',
          path,
          `strings must not exceed ${String(CANONICAL_JSON_LIMITS.maximumStringCodeUnits)} UTF-16 code units`,
        );
      }
      return JSON.stringify(value);
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      return fail('UNSUPPORTED_TYPE', path, `${typeof value} values are not supported`);
    case 'object': {
      if (state.ancestors.has(value)) {
        return fail('CYCLIC_REFERENCE', path, 'cyclic references are not supported');
      }
      state.ancestors.add(value);
      try {
        return Array.isArray(value)
          ? serializeArray(value, path, state, depth)
          : serializeObject(value, path, state, depth);
      } finally {
        state.ancestors.delete(value);
      }
    }
  }
  return fail('UNSUPPORTED_TYPE', path, 'unsupported value');
};

const validateVersion = (value: unknown, field: string): string => {
  const path = `#/${field}`;
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return fail(
      'INVALID_QUALIFIER',
      path,
      `${field} must be a non-empty string without surrounding whitespace`,
    );
  }
  if (value.length > CANONICAL_JSON_LIMITS.maximumQualifierCodeUnits) {
    return fail(
      'MAXIMUM_QUALIFIER_LENGTH',
      path,
      `identity qualifiers must not exceed ${String(CANONICAL_JSON_LIMITS.maximumQualifierCodeUnits)} UTF-16 code units`,
    );
  }
  return value;
};

const qualifiedEnvelope = (
  value: unknown,
  qualification: CanonicalJsonQualification,
): QualifiedHashEnvelope => ({
  canonicalizationVersion: CANONICAL_JSON_VERSION,
  schemaVersion: validateVersion(qualification.schemaVersion, 'schemaVersion'),
  projectionVersion: validateVersion(qualification.projectionVersion, 'projectionVersion'),
  value,
});

/** Serializes the supported JSON data domain without invoking getters or `toJSON`. */
export function canonicalJsonStringify(value: unknown): string {
  return serialize(value, '#', { ancestors: new Set(), nodes: 0 }, 0);
}

/** Encodes canonical JSON as UTF-8 bytes. */
export function canonicalJsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalJsonStringify(value));
}

/** Returns the exact domain-separated bytes used by {@link hashCanonicalJson}. */
export function qualifiedCanonicalJsonBytes(
  value: unknown,
  qualification: CanonicalJsonQualification,
): Uint8Array<ArrayBuffer> {
  return canonicalJsonBytes(qualifiedEnvelope(value, qualification));
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Hashes qualified canonical JSON with the browser Web Crypto API. */
export async function hashCanonicalJson(
  value: unknown,
  qualification: CanonicalJsonQualification,
): Promise<QualifiedContentHash> {
  const envelope = qualifiedEnvelope(value, qualification);
  const bytes = canonicalJsonBytes(envelope);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return {
    algorithm: CANONICAL_HASH_ALGORITHM,
    canonicalizationVersion: CANONICAL_JSON_VERSION,
    schemaVersion: envelope.schemaVersion,
    projectionVersion: envelope.projectionVersion,
    digestHex: bytesToHex(new Uint8Array(digest)),
  };
}
