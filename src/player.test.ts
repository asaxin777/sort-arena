import { describe, expect, it } from 'vitest';
import { advanceLane, createLane, seekLane } from './player';

describe('lane playback', () => {
  it('drains setup metadata without consuming the first comparison', () => {
    const lane = createLane('quick', [3, 2, 1]);
    expect(lane.steps).toBe(0);
    expect(lane.comparisons).toBe(0);
    expect(lane.swaps).toBe(0);
    expect(lane.pivot).toBe(2);
    expect(lane.range).toEqual([0, 2]);
    expect(lane.tape[lane.cursor].type).toBe('compare');
  });

  it('consumes one operation at a time and counts at playback time', () => {
    let lane = createLane('bubble', [3, 2, 1]);
    lane = advanceLane(lane, 100);
    expect(lane.comparisons).toBe(1);
    expect(lane.swaps).toBe(0);
    expect(lane.steps).toBe(1);
    expect(lane.values).toEqual([3, 2, 1]);
    expect(lane.active).toEqual([0, 1]);
    expect(lane.lastOperation).toBe('compare');
    lane = advanceLane(lane, 200);
    expect(lane.comparisons).toBe(1);
    expect(lane.swaps).toBe(1);
    expect(lane.steps).toBe(2);
    expect(lane.values).toEqual([2, 3, 1]);
    expect(lane.lastOperation).toBe('swap');
  });

  it('never changes the input, prior lane, or shared tape', () => {
    const input = [3, 2, 1];
    const previous = advanceLane(createLane('bubble', input), 100);
    const snapshot = structuredClone(previous);
    const next = advanceLane(previous, 200);
    expect(previous).toEqual(snapshot);
    expect(input).toEqual([3, 2, 1]);
    expect(next.tape).toBe(previous.tape);
    expect(next.values).not.toBe(previous.values);
    expect(next.values).toEqual([2, 3, 1]);
  });

  it('keeps the operation caption while draining subsequent range and pivot markers', () => {
    let lane = createLane('quick', [3, 2, 1]);
    lane = advanceLane(lane, 100);
    lane = advanceLane(lane, 200);
    lane = advanceLane(lane, 300);
    expect(lane.lastOperation).toBe('swap');
    expect(lane.message).toContain('交換');
    expect(lane.line).toBe(6);
    expect(lane.pivot).toBe(2);
    expect(lane.range).toEqual([1, 2]);
    expect(lane.sorted).toContain(0);
  });

  it('finishes on the final counted operation, without an extra timer tick', () => {
    let lane = createLane('bubble', [3, 2, 1]);
    for (let n = 1; n <= 6; n++) lane = advanceLane(lane, n * 100);
    expect(lane.done).toBe(true);
    expect(lane.steps).toBe(6);
    expect(lane.comparisons).toBe(3);
    expect(lane.swaps).toBe(3);
    expect(lane.values).toEqual([1, 2, 3]);
    expect(lane.sorted).toHaveLength(3);
    expect(lane.finishedAt).toBe(600);
    expect(lane.active).toEqual([]);
    expect(advanceLane(lane, 999)).toBe(lane);
  });

  it('preserves finished time when the other lane keeps advancing', () => {
    let lane = createLane('bubble', [1, 2]);
    lane = advanceLane(lane, 123);
    expect(lane.done).toBe(true);
    expect(advanceLane(lane, 456).finishedAt).toBe(123);
  });
});

describe('silent seeking', () => {
  it('matches forward playback at any operation index', () => {
    const input = [4, 1, 3, 2];
    let lane = createLane('quick', input);
    while (!lane.done) {
      const sought = seekLane('quick', input, lane.steps);
      expect(sought).toEqual(lane);
      lane = advanceLane(lane, 0);
    }
    expect(seekLane('quick', input, lane.steps)).toEqual(lane);
  });

  it('clamps before the start and past the end', () => {
    expect(seekLane('bubble', [2, 1], -20).steps).toBe(0);
    expect(seekLane('bubble', [2, 1], Number.NaN).steps).toBe(0);
    const end = seekLane('bubble', [2, 1], 10000);
    expect(end.done).toBe(true);
    expect(end.steps).toBe(2);
  });
});
