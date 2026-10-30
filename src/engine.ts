export type Algorithm = 'quick' | 'bubble';
export type Distribution = 'random' | 'nearly' | 'reversed' | 'duplicates';

type EventDetails = { line: number; message: string };

export type SortEvent = EventDetails & (
  | { type: 'compare'; indices: [number, number] }
  | { type: 'swap'; indices: [number, number] }
  | { type: 'pivot'; index: number | null }
  | { type: 'range'; indices: [number, number] }
  | { type: 'markSorted'; indices: number[] }
  | { type: 'done' }
);

/** Zero-based line numbers match the `line` on every emitted event. */
export const PSEUDOCODE: Record<Algorithm, string[]> = {
  quick: [
    'quickSort(left, right)',
    '  pivot = values[right]',
    '  i = left',
    '  for j = left … right - 1',
    '    if values[j] ≤ pivot',
    '      swap(values[i++], values[j])',
    '  swap(values[i], values[right])',
    '  quickSort(left, i - 1); quickSort(i + 1, right)',
    '  return sorted',
  ],
  bubble: [
    'for end = length - 1 … 1',
    '  swapped = false',
    '  for j = 0 … end - 1',
    '    if values[j] > values[j + 1]',
    '      swap(values[j], values[j + 1])',
    '      swapped = true',
    '  markSorted(end)',
    '  if !swapped: break',
    'return sorted',
  ],
};

const indexRange = (start: number, end: number) =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);

/** Lomuto partition with the last element as pivot. The caller's input is never changed. */
export function* quickSort(input: readonly number[]): Generator<SortEvent> {
  const values = [...input];

  function* sort(left: number, right: number): Generator<SortEvent> {
    if (left > right) return;
    if (left === right) {
      yield { type: 'markSorted', indices: [left], line: 7, message: `索引 ${left} 已位於正確位置。` };
      return;
    }

    yield { type: 'range', indices: [left, right], line: 0, message: `處理索引 ${left} 到 ${right} 的區間。` };
    const pivot = values[right];
    yield { type: 'pivot', index: right, line: 1, message: `選擇區間末端的 ${pivot} 作為 pivot。` };
    let boundary = left;

    for (let j = left; j < right; j++) {
      yield { type: 'compare', indices: [j, right], line: 4, message: `比較索引 ${j} 的 ${values[j]} 與 pivot ${pivot}。` };
      if (values[j] <= pivot) {
        if (boundary !== j) {
          const a = values[boundary];
          const b = values[j];
          [values[boundary], values[j]] = [b, a];
          yield { type: 'swap', indices: [boundary, j], line: 5, message: `交換 ${a} 與 ${b}，將較小的值放入左側。` };
        }
        boundary++;
      }
    }

    if (boundary !== right) {
      const displaced = values[boundary];
      [values[boundary], values[right]] = [values[right], values[boundary]];
      yield { type: 'swap', indices: [boundary, right], line: 6, message: `交換 ${displaced} 與 pivot ${pivot}，確定 pivot 的位置。` };
    }

    yield { type: 'markSorted', indices: [boundary], line: 7, message: `pivot ${pivot} 已固定在索引 ${boundary}。` };
    yield { type: 'pivot', index: null, line: 7, message: '接著分別排序 pivot 左右兩側。' };
    yield* sort(left, boundary - 1);
    yield* sort(boundary + 1, right);
  }

  yield* sort(0, values.length - 1);
  yield { type: 'done', line: 8, message: 'Quick Sort 排序完成！所有元素皆已就位。' };
}

/** Bubble Sort exits immediately after a complete pass with no swaps. */
export function* bubbleSort(input: readonly number[]): Generator<SortEvent> {
  const values = [...input];

  for (let end = values.length - 1; end > 0; end--) {
    let swapped = false;
    yield { type: 'range', indices: [0, end], line: 0, message: `新的一輪：將索引 0 到 ${end} 的最大值推向右側。` };

    for (let j = 0; j < end; j++) {
      yield { type: 'compare', indices: [j, j + 1], line: 3, message: `比較相鄰的 ${values[j]} 與 ${values[j + 1]}（索引 ${j}、${j + 1}）。` };
      if (values[j] > values[j + 1]) {
        const a = values[j];
        const b = values[j + 1];
        [values[j], values[j + 1]] = [b, a];
        swapped = true;
        yield { type: 'swap', indices: [j, j + 1], line: 4, message: `交換 ${a} 與 ${b}，將較大的值向右移。` };
      }
    }

    yield { type: 'markSorted', indices: [end], line: 6, message: `索引 ${end} 已就位，本輪完成。` };
    if (!swapped) {
      yield { type: 'markSorted', indices: indexRange(0, end - 1), line: 7, message: '整輪沒有交換，其餘元素已排序，提早完成。' };
      yield { type: 'done', line: 8, message: '本輪沒有交換，Bubble Sort 提早完成！' };
      return;
    }
  }

  if (values.length > 0) {
    yield { type: 'markSorted', indices: [0], line: 8, message: '最後一個元素也已就位。' };
  }
  yield { type: 'done', line: 8, message: 'Bubble Sort 排序完成！所有元素皆已就位。' };
}

export function buildTape(algorithm: Algorithm, input: readonly number[]): SortEvent[] {
  return Array.from(algorithm === 'quick' ? quickSort(input) : bubbleSort(input));
}

/** FNV-1a seed hash followed by Mulberry32; no Math.random or clock dependence. */
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), state | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateData(size: number, distribution: Distribution, seed: string): number[] {
  if (!Number.isInteger(size) || size < 2 || size > 100) {
    throw new Error('元素數量必須是 2～100 之間的整數。');
  }
  const random = seededRandom(seed);
  const values = Array.from({ length: size }, () => 1 + Math.floor(random() * 100));
  if (distribution === 'random') return values;
  if (distribution === 'duplicates') {
    const palette = [15, 35, 55, 75, 95];
    return values.map(() => palette[Math.floor(random() * palette.length)]);
  }
  values.sort((a, b) => a - b);
  if (distribution === 'reversed') return values.reverse();
  if (distribution === 'nearly') {
    for (let n = 0; n < Math.max(1, Math.floor(size / 12)); n++) {
      const left = Math.floor(random() * (size - 1));
      [values[left], values[left + 1]] = [values[left + 1], values[left]];
    }
  }
  return values;
}

export function parseCustomData(text: string): number[] {
  const tokens = text.trim().split(/[,，]/);
  if (tokens.length < 2 || tokens.length > 100) {
    throw new Error('請輸入 2～100 個整數，以逗號分隔。');
  }
  if (tokens.some((token) => !/^\d+$/.test(token.trim()))) {
    throw new Error('每一項都必須是整數，且逗號之間不能留空。');
  }
  const values = tokens.map((token) => Number(token.trim()));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 100)) {
    throw new Error('每個數值必須介於 1～100。');
  }
  return values;
}
