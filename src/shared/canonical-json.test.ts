import { describe, expect, it } from 'vitest';

import {
  CANONICAL_HASH_ALGORITHM,
  CANONICAL_JSON_LIMITS,
  CANONICAL_JSON_VERSION,
  CanonicalJsonError,
  canonicalJsonBytes,
  canonicalJsonStringify,
  hashCanonicalJson,
  qualifiedCanonicalJsonBytes,
} from './canonical-json';

const qualification = {
  schemaVersion: 'practice-document/v1',
  projectionVersion: 'practice-document-content/v1',
} as const;

describe('canonical JSON serialization', () => {
  it('sorts object keys recursively while preserving semantic array order', () => {
    const left = {
      z: true,
      nested: { beta: 2, alpha: 1 },
      ordered: [{ y: 'second', x: 'first' }, 0, null],
      a: 'start',
    };
    const right = {
      a: 'start',
      ordered: [{ x: 'first', y: 'second' }, 0, null],
      nested: { alpha: 1, beta: 2 },
      z: true,
    };

    const expected =
      '{"a":"start","nested":{"alpha":1,"beta":2},"ordered":[{"x":"first","y":"second"},0,null],"z":true}';
    expect(canonicalJsonStringify(left)).toBe(expected);
    expect(canonicalJsonStringify(right)).toBe(expected);
    expect(canonicalJsonStringify({ ordered: [2, 1] })).not.toBe(
      canonicalJsonStringify({ ordered: [1, 2] }),
    );
  });

  it('has stable escaping, negative-zero normalization, and UTF-8 golden bytes', () => {
    const value = { text: 'caf\u00e9 \ud800', zero: -0 };
    const expected = '{"text":"caf\u00e9 \\ud800","zero":0}';

    expect(canonicalJsonStringify(value)).toBe(expected);
    expect(Array.from(canonicalJsonBytes(value))).toEqual([
      123, 34, 116, 101, 120, 116, 34, 58, 34, 99, 97, 102, 195, 169, 32, 92, 117, 100, 56, 48, 48,
      34, 44, 34, 122, 101, 114, 111, 34, 58, 48, 125,
    ]);
  });

  it('rejects every value outside the supported JSON data domain', () => {
    const rejected: unknown[] = [
      undefined,
      () => undefined,
      Symbol('value'),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      new Date(0),
      new Map(),
    ];

    for (const value of rejected) {
      expect(() => canonicalJsonStringify(value)).toThrow(TypeError);
    }
  });

  it('rejects invalid nested members, sparse arrays, and non-index array properties', () => {
    expect(() => canonicalJsonStringify({ okay: 1, bad: undefined })).toThrow(/#\/bad/);
    const sparse = new Array<unknown>(3);
    sparse[0] = true;
    sparse[2] = false;
    expect(() => canonicalJsonStringify(sparse)).toThrow(/#\/1/);

    const arrayWithProperty: unknown[] & { label?: string } = [];
    arrayWithProperty.label = 'hidden structure';
    expect(() => canonicalJsonStringify(arrayWithProperty)).toThrow(/non-index array properties/);
  });

  it('rejects cycles but permits repeated acyclic references', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => canonicalJsonStringify(cycle)).toThrow(/cyclic references/);

    const shared = { value: 3 };
    expect(canonicalJsonStringify([shared, shared])).toBe('[{"value":3},{"value":3}]');
  });

  it('rejects symbols, accessors, and hidden properties without invoking getters', () => {
    const symbolKey = Symbol('secret');
    expect(() => canonicalJsonStringify({ visible: true, [symbolKey]: false })).toThrow(
      /symbol properties/,
    );

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'danger', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'unexpected';
      },
    });
    expect(() => canonicalJsonStringify(accessor)).toThrow(/accessor properties/);
    expect(getterCalls).toBe(0);

    const hidden = Object.defineProperty({}, 'secret', { value: 1 });
    expect(() => canonicalJsonStringify(hidden)).toThrow(/non-enumerable properties/);
  });
});

describe('canonical JSON resource limits', () => {
  const expectCode = (action: () => unknown, code: CanonicalJsonError['code']): void => {
    try {
      action();
      throw new Error(`Expected canonical JSON error ${code}.`);
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalJsonError);
      expect(error).toMatchObject({ code });
      expect((error as Error).message).toContain(`[${code}]`);
    }
  };

  it('enforces a stable maximum depth before the JavaScript call stack becomes authority', () => {
    let value: unknown = null;
    for (let depth = 0; depth <= CANONICAL_JSON_LIMITS.maximumDepth; depth += 1) {
      value = [value];
    }
    expectCode(() => canonicalJsonStringify(value), 'MAXIMUM_DEPTH');
  });

  it('bounds string, key, and container sizes with stable error codes', () => {
    expectCode(
      () => canonicalJsonStringify('x'.repeat(CANONICAL_JSON_LIMITS.maximumStringCodeUnits + 1)),
      'MAXIMUM_STRING_LENGTH',
    );
    expectCode(
      () =>
        canonicalJsonStringify({
          ['k'.repeat(CANONICAL_JSON_LIMITS.maximumKeyCodeUnits + 1)]: true,
        }),
      'MAXIMUM_KEY_LENGTH',
    );
    expectCode(
      () => canonicalJsonStringify(new Array(CANONICAL_JSON_LIMITS.maximumArrayLength + 1)),
      'MAXIMUM_ARRAY_LENGTH',
    );
    const tooManyProperties = Object.fromEntries(
      Array.from({ length: CANONICAL_JSON_LIMITS.maximumObjectProperties + 1 }, (_, index) => [
        `key-${String(index)}`,
        true,
      ]),
    );
    expectCode(() => canonicalJsonStringify(tooManyProperties), 'MAXIMUM_OBJECT_PROPERTIES');
  });

  it('counts repeated acyclic values toward the node budget', () => {
    const sharedWideValue = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`field-${String(index)}`, index]),
    );
    const value = new Array(14_000).fill(sharedWideValue);
    expectCode(() => canonicalJsonStringify(value), 'MAXIMUM_NODE_COUNT');
  });

  it('bounds and validates both identity qualifiers before serialization', () => {
    const tooLong = 'q'.repeat(CANONICAL_JSON_LIMITS.maximumQualifierCodeUnits + 1);
    expectCode(
      () => qualifiedCanonicalJsonBytes({}, { ...qualification, schemaVersion: tooLong }),
      'MAXIMUM_QUALIFIER_LENGTH',
    );
    expectCode(
      () => qualifiedCanonicalJsonBytes({}, { ...qualification, projectionVersion: '\tinvalid' }),
      'INVALID_QUALIFIER',
    );
  });
});

describe('qualified canonical content hashing', () => {
  const value = { z: true, items: [3, 2, 1], a: '\u00e9' };
  const goldenEnvelope =
    '{"canonicalizationVersion":"stringsight-canonical-json/v1","projectionVersion":"practice-document-content/v1","schemaVersion":"practice-document/v1","value":{"a":"\u00e9","items":[3,2,1],"z":true}}';

  it('materializes exact version-qualified golden bytes', () => {
    const bytes = qualifiedCanonicalJsonBytes(value, qualification);
    expect(new TextDecoder().decode(bytes)).toBe(goldenEnvelope);
  });

  it('returns a qualified golden SHA-256 identity', async () => {
    const result = await hashCanonicalJson(value, qualification);
    expect(result).toEqual({
      algorithm: CANONICAL_HASH_ALGORITHM,
      canonicalizationVersion: CANONICAL_JSON_VERSION,
      schemaVersion: qualification.schemaVersion,
      projectionVersion: qualification.projectionVersion,
      digestHex: '533ecf103968ec61e625d74c8025d148c25a036cf8aa915ce8e62c0dd7580ce8',
    });
  });

  it('domain-separates schema and projection versions', async () => {
    const base = await hashCanonicalJson(value, qualification);
    const changedSchema = await hashCanonicalJson(value, {
      ...qualification,
      schemaVersion: 'practice-document/v2',
    });
    const changedProjection = await hashCanonicalJson(value, {
      ...qualification,
      projectionVersion: 'practice-document-content/v2',
    });

    expect(changedSchema.digestHex).not.toBe(base.digestHex);
    expect(changedProjection.digestHex).not.toBe(base.digestHex);
  });

  it('rejects absent-looking or ambiguous identity qualifiers', async () => {
    await expect(hashCanonicalJson(value, { ...qualification, schemaVersion: '' })).rejects.toThrow(
      /schemaVersion/,
    );
    await expect(
      hashCanonicalJson(value, { ...qualification, projectionVersion: ' content/v1 ' }),
    ).rejects.toThrow(/projectionVersion/);
  });
});
