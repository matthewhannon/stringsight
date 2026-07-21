import type { NotationAdapter } from './contract';
import { createReferenceNotationAdapter } from './reference-adapter';

/**
 * Test-only fake with deliberately different coordinates and identity. It is intentionally not
 * exported from the production notation barrel.
 */
export function createFakeNotationAdapter(): NotationAdapter {
  return createReferenceNotationAdapter({
    adapterId: 'stringsight-fake-notation',
    adapterVersion: '1',
    coordinateOffset: 37,
  });
}
