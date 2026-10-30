import { buildTape, type Algorithm, type SortEvent } from './engine';

export interface Lane {
  algorithm: Algorithm;
  values: number[];
  tape: SortEvent[];
  cursor: number;
  comparisons: number;
  swaps: number;
  steps: number;
  active: number[];
  sorted: number[];
  pivot: number | null;
  range: [number, number] | null;
  line: number;
  message: string;
  done: boolean;
  finishedAt: number | null;
  lastOperation: 'compare' | 'swap' | null;
}

const isOperation = (event: SortEvent) => event.type === 'compare' || event.type === 'swap';

/** Apply metadata without spending an operation or changing the displayed operation caption. */
function drainMetadata(lane: Lane, elapsedMs: number, initial: boolean) {
  while (lane.cursor < lane.tape.length && !isOperation(lane.tape[lane.cursor])) {
    const event = lane.tape[lane.cursor++];
    if (initial) {
      lane.line = event.line;
      lane.message = event.message;
    }
    switch (event.type) {
      case 'pivot':
        lane.pivot = event.index;
        break;
      case 'range':
        lane.range = [...event.indices];
        break;
      case 'markSorted':
        lane.sorted = [...new Set([...lane.sorted, ...event.indices])];
        break;
      case 'done':
        lane.done = true;
        lane.finishedAt = elapsedMs;
        lane.active = [];
        lane.pivot = null;
        lane.range = null;
        lane.line = event.line;
        lane.message = event.message;
        break;
    }
  }
}

export function createLane(algorithm: Algorithm, input: readonly number[]): Lane {
  const lane: Lane = {
    algorithm,
    values: [...input],
    tape: buildTape(algorithm, input),
    cursor: 0,
    comparisons: 0,
    swaps: 0,
    steps: 0,
    active: [],
    sorted: [],
    pivot: null,
    range: null,
    line: 0,
    message: '準備完成，等待開始。',
    done: false,
    finishedAt: null,
    lastOperation: null,
  };
  drainMetadata(lane, 0, true);
  return lane;
}

/** Advance exactly one comparison or swap. Previous lane and event tape remain untouched. */
export function advanceLane(previous: Lane, elapsedMs: number): Lane {
  if (previous.done) return previous;
  const lane: Lane = {
    ...previous,
    values: [...previous.values],
    active: [...previous.active],
    sorted: [...previous.sorted],
    range: previous.range ? [...previous.range] : null,
  };
  const event = lane.tape[lane.cursor++];
  if (!event || (event.type !== 'compare' && event.type !== 'swap')) {
    throw new Error('播放序列缺少下一個比較或交換事件。');
  }

  lane.steps++;
  lane.active = [...event.indices];
  lane.line = event.line;
  lane.message = event.message;
  lane.lastOperation = event.type;
  if (event.type === 'compare') {
    lane.comparisons++;
  } else {
    const [a, b] = event.indices;
    [lane.values[a], lane.values[b]] = [lane.values[b], lane.values[a]];
    lane.swaps++;
  }
  drainMetadata(lane, elapsedMs, false);
  return lane;
}

/** Reconstruct a view for a replay scrubber; elapsed time belongs to the original race. */
export function seekLane(algorithm: Algorithm, input: readonly number[], step: number): Lane {
  let lane = createLane(algorithm, input);
  const target = Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;
  while (!lane.done && lane.steps < target) lane = advanceLane(lane, 0);
  return lane;
}
