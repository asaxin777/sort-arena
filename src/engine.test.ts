import { describe, expect, it } from 'vitest';
import { buildTape, generateData, parseCustomData, PSEUDOCODE, type Algorithm, type Distribution } from './engine';

const algorithms: Algorithm[] = ['quick', 'bubble'];

function replay(algorithm: Algorithm, input: number[]) {
  const values = [...input];
  const events = buildTape(algorithm, input);
  const sorted = new Set<number>();
  for (const event of events) {
    expect(event.line).toBeGreaterThanOrEqual(0);
    expect(event.line).toBeLessThan(PSEUDOCODE[algorithm].length);
    if (event.type === 'compare' || event.type === 'swap') {
      for (const index of event.indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(input.length);
      }
    }
    if (event.type === 'swap') {
      const [a, b] = event.indices;
      expect(a).not.toBe(b);
      expect(sorted.has(a)).toBe(false);
      expect(sorted.has(b)).toBe(false);
      [values[a], values[b]] = [values[b], values[a]];
    }
    if (event.type === 'markSorted') {
      for (const index of event.indices) sorted.add(index);
    }
  }
  expect(events.filter((event) => event.type === 'done')).toHaveLength(1);
  expect(events.at(-1)?.type).toBe('done');
  expect(sorted.size).toBe(input.length);
  return { values, events };
}

describe.each(algorithms)('%s event stream', (algorithm) => {
  it.each([
    [], [1], [2, 1], [1, 2], [3, 2, 1], [1, 2, 3, 4, 5],
    [5, 4, 3, 2, 1], [4, 1, 4, 2, 1, 4], [7, 7, 7, 7],
    generateData(100, 'random', 'regression'),
  ])('sorts %j through valid operations without changing its input', (...input) => {
    const original = [...input];
    const { values } = replay(algorithm, input);
    expect(values).toEqual([...input].sort((a, b) => a - b));
    expect(input).toEqual(original);
  });

  it('replays deterministically', () => {
    const input = generateData(30, 'duplicates', 'stable');
    expect(buildTape(algorithm, input)).toEqual(buildTape(algorithm, input));
  });
});

describe('operation counting contracts', () => {
  it('uses exactly three comparisons and three swaps for Bubble Sort [3, 2, 1]', () => {
    const events = buildTape('bubble', [3, 2, 1]);
    expect(events.filter((event) => event.type === 'compare')).toHaveLength(3);
    expect(events.filter((event) => event.type === 'swap')).toHaveLength(3);
  });

  it('ends an already sorted Bubble Sort after one pass', () => {
    const events = buildTape('bubble', [1, 2, 3, 4, 5]);
    expect(events.filter((event) => event.type === 'compare')).toHaveLength(4);
    expect(events.filter((event) => event.type === 'swap')).toHaveLength(0);
  });

  it('exposes the last-pivot Quick Sort worst case without counting self swaps', () => {
    const events = buildTape('quick', [1, 2, 3, 4, 5]);
    expect(events.filter((event) => event.type === 'compare')).toHaveLength(10);
    expect(events.filter((event) => event.type === 'swap')).toHaveLength(0);
  });
});

describe('seeded data generation', () => {
  const distributions: Distribution[] = ['random', 'nearly', 'reversed', 'duplicates'];
  it.each(distributions)('makes reproducible bounded %s data', (distribution) => {
    const values = generateData(100, distribution, 'demo');
    expect(values).toEqual(generateData(100, distribution, 'demo'));
    expect(values).toHaveLength(100);
    expect(values.every((value) => Number.isInteger(value) && value >= 1 && value <= 100)).toBe(true);
  });

  it('changes the random data when the seed changes', () => {
    expect(generateData(30, 'random', 'a')).not.toEqual(generateData(30, 'random', 'b'));
  });

  it('returns descending data for the reversed distribution', () => {
    const values = generateData(100, 'reversed', 'demo');
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it.each([1, 101, 2.5, Number.NaN])('rejects invalid sizes: %s', (size) => {
    expect(() => generateData(size, 'random', 'demo')).toThrow();
  });
});

describe('custom data validation', () => {
  it('accepts whitespace, Chinese commas, duplicates and boundary values', () => {
    expect(parseCustomData(' 1, 100， 5, 5 ')).toEqual([1, 100, 5, 5]);
  });

  it.each(['', '1', '1,,2', '1,2,', '1, ,2', '1,2.5', '1,2e1', '1,no', '0,2', '-1,2', '1,101', '1,Infinity', Array(101).fill('1').join(',')])('rejects invalid input %j', (text) => {
    expect(() => parseCustomData(text)).toThrow();
  });
});
