/**
 * Unit tests for the storefront menu helpers (src/lib/menuData.ts).
 *
 * The menu is loaded in ONE embedded Supabase request (products + variations)
 * instead of one request per product, so the per-product variation ordering that
 * PostgREST used to do now happens here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSortedVariations, isMenuStale, MENU_STALE_AFTER_MS } from '../src/lib/menuData.ts';

test('withSortedVariations: orders each product\'s variations by quantity_mg ascending', () => {
  const rows = [
    { id: 'p1', name: 'A', variations: [{ id: 'v3', quantity_mg: 30 }, { id: 'v1', quantity_mg: 5 }, { id: 'v2', quantity_mg: 15 }] },
    { id: 'p2', name: 'B', variations: [{ id: 'v4', quantity_mg: 10 }] },
  ];

  const out = withSortedVariations(rows);

  assert.deepEqual(out[0].variations.map((v) => v.id), ['v1', 'v2', 'v3']);
  assert.deepEqual(out[1].variations.map((v) => v.id), ['v4']);
});

test('withSortedVariations: equal quantity_mg falls back to creation order, then id', () => {
  const rows = [{
    id: 'p1',
    variations: [
      { id: 'c', quantity_mg: 1, created_at: '2026-01-03T00:00:00Z' },
      { id: 'b', quantity_mg: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: 'a', quantity_mg: 1, created_at: '2026-01-03T00:00:00Z' },
      { id: 'z', quantity_mg: 0.5, created_at: '2026-01-09T00:00:00Z' },
    ],
  }];

  const out = withSortedVariations(rows);

  assert.deepEqual(out[0].variations.map((v) => v.id), ['z', 'b', 'a', 'c']);
});

test('withSortedVariations: missing or null variations become an empty array', () => {
  const out = withSortedVariations([{ id: 'p1' }, { id: 'p2', variations: null }]);

  assert.deepEqual(out[0].variations, []);
  assert.deepEqual(out[1].variations, []);
});

test('withSortedVariations: does not mutate the input rows', () => {
  const original = [{ id: 'p1', variations: [{ id: 'b', quantity_mg: 2 }, { id: 'a', quantity_mg: 1 }] }];

  withSortedVariations(original);

  assert.deepEqual(original[0].variations.map((v) => v.id), ['b', 'a']);
});

test('isMenuStale: never-fetched is stale; fresh data is not; old data is', () => {
  const now = 1_000_000_000;

  assert.equal(isMenuStale(0, now), true);
  assert.equal(isMenuStale(now - 1000, now), false);
  assert.equal(isMenuStale(now - MENU_STALE_AFTER_MS - 1, now), true);
});
