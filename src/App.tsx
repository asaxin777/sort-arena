import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Dices,
  Download,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Info,
  Keyboard,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { generateData, parseCustomData, PSEUDOCODE } from "./engine";
import type { Algorithm, Distribution } from "./engine";
import { advanceLane, createLane, seekLane } from "./player";
import type { Lane } from "./player";
import { SortAudio } from "./audio";

type Status = "idle" | "running" | "paused" | "completed";
type Source = "both" | Algorithm;
type Prediction = Algorithm | "tie";
type DataMode = Distribution | "sorted";
type Race = {
  lanes: [Lane, Lane];
  input: number[];
  status: Status;
  tick: number;
  elapsed: number;
  seed: string;
  distribution: string;
};
type Result = {
  lanes: [Lane, Lane];
  prediction: Prediction | null;
  reason: string;
  seed: string;
  input: number[];
  distribution: string;
};

const MODES: Record<DataMode, string> = {
  random: "隨機分布",
  nearly: "接近排序",
  reversed: "完全反向",
  duplicates: "大量重複值",
  sorted: "已排序",
};
const STATUS: Record<Status, string> = {
  idle: "準備就緒",
  running: "競賽進行中",
  paused: "已暫停",
  completed: "競賽完成",
};
const format = (n: number) => n.toLocaleString("en-US");
const duration = (n: number | null) => `${((n ?? 0) / 1000).toFixed(1)}s`;
const makeRace = (
  input: number[],
  seed: string,
  distribution: string,
): Race => ({
  input,
  seed,
  distribution,
  lanes: [createLane("quick", input), createLane("bubble", input)],
  status: "idle",
  tick: 0,
  elapsed: 0,
});
const INITIAL = generateData(30, "random", "ARENA-2026");

function LanePanel({
  lane,
  status,
  index,
  elapsed,
  replay,
  originalTime,
}: {
  lane: Lane;
  status: Status;
  index: number;
  elapsed: number;
  replay: boolean;
  originalTime?: number | null;
}) {
  const [showCode, setShowCode] = useState(false);
  const quick = lane.algorithm === "quick";
  const [hover, setHover] = useState<number | null>(null);
  const n = lane.values.length;
  const max = Math.max(...lane.values, 1);
  const title = quick ? "Quick Sort" : "Bubble Sort";
  const stateText = lane.done ? "已完成" : replay ? "回放中" : STATUS[status];
  return (
    <section
      className={`lane ${quick ? "quick" : "bubble"}`}
      aria-label={`${title} 競賽面板`}
    >
      <div className="lane-heading">
        <div className="lane-title">
          <span className="team-icon">
            {quick ? <Shuffle size={19} /> : <ArrowDownUp size={19} />}
          </span>
          <div>
            <div className="lane-eyebrow">ALGORITHM 0{index + 1}</div>
            <h2>
              {title}
              <span>{quick ? "快速排序" : "氣泡排序"}</span>
            </h2>
          </div>
        </div>
        <span className={`lane-status ${lane.done ? "done" : ""}`}>
          <span className="status-dot" />
          {stateText}
        </span>
      </div>
      <div className="lane-subtitle">
        <span>
          {quick
            ? "分而治之 · 末端元素作為 pivot"
            : "相鄰比較 · 無交換時提早完成"}
        </span>
        <span className="complexity">
          {quick ? "O(n log n) 平均" : "O(n²) 平均"}
        </span>
      </div>
      <div className="chart-wrap">
        <div className="chart-scale">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <svg
          className="bar-chart"
          viewBox="0 0 600 250"
          role="img"
          aria-label={`${title} 長條圖，${n} 個元素${lane.done ? "，已完成排序" : ""}`}
          onMouseLeave={() => setHover(null)}
        >
          <title>{`${title}：${lane.values.join(", ")}`}</title>
          {[20, 120, 220].map((y) => (
            <line key={y} x1="0" x2="600" y1={y} y2={y} className="grid-line" />
          ))}
          {lane.values.map((value, i) => {
            const width = 600 / n;
            const height = Math.max(3, (value / max) * 192);
            const active = lane.active.includes(i) && !lane.done;
            const sorted = lane.sorted.includes(i);
            const pivot = lane.pivot === i && !lane.done;
            const outside =
              lane.range && (i < lane.range[0] || i > lane.range[1]) && !sorted;
            return (
              <g
                key={i}
                className={`bar-group ${active ? "active" : ""} ${sorted ? "sorted" : ""} ${pivot ? "pivot" : ""} ${outside ? "outside" : ""}`}
                onMouseEnter={() => setHover(i)}
              >
                <title>{`索引 ${i}：${value}${pivot ? " (pivot)" : ""}${sorted ? " (已就位)" : ""}${active ? " (操作中)" : ""}`}</title>
                <rect
                  x={i * width + Math.min(2, width * 0.15)}
                  y={220 - height}
                  width={Math.max(1, width - Math.min(4, width * 0.3))}
                  height={height}
                  rx={Math.min(2, width / 5)}
                />
                {pivot && (
                  <path
                    className="pivot-marker"
                    d={`M${i * width + width / 2} ${210 - height} l-3 -5 h6 z`}
                  />
                )}
                {sorted && (
                  <line
                    className="sorted-marker"
                    x1={i * width + width * 0.3}
                    x2={i * width + width * 0.7}
                    y1={224}
                    y2={224}
                  />
                )}
                {n <= 35 && (
                  <text x={i * width + width / 2} y="242" textAnchor="middle">
                    {value}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="chart-hover">
          {hover !== null
            ? `索引 ${hover} → 數值 ${lane.values[hover]}`
            : `${n} 個元素 · ${lane.done ? "所有元素已就位" : "將游標移至長條查看數值"}`}
        </div>
      </div>
      <div className="lane-stats">
        <div>
          <span>
            <GitCompareArrows size={13} />
            比較次數
          </span>
          <strong data-testid={`${lane.algorithm}-comparisons`}>
            {format(lane.comparisons)}
          </strong>
        </div>
        <div>
          <span>
            <ArrowDownUp size={13} />
            交換次數
          </span>
          <strong data-testid={`${lane.algorithm}-swaps`}>
            {format(lane.swaps)}
          </strong>
        </div>
        <div>
          <span>
            <Layers3 size={13} />
            操作步數
          </span>
          <strong data-testid={`${lane.algorithm}-steps`}>
            {format(lane.steps)}
          </strong>
        </div>
        <div>
          <span>
            <Gauge size={13} />
            {replay ? "原播放時間" : "播放時間"}
          </span>
          <strong className="time">
            {duration(
              replay ? (originalTime ?? null) : (lane.finishedAt ?? elapsed),
            )}
          </strong>
        </div>
      </div>
      <div className="step-caption">
        <span className="caption-indicator">
          {lane.done ? <Check size={14} /> : <ArrowRight size={14} />}
        </span>
        <p>
          {status === "idle"
            ? "舞台已準備好。按下「開始競賽」，觀察每一步。"
            : lane.message}
        </p>
      </div>
      <button
        className="code-toggle"
        onClick={() => setShowCode(!showCode)}
        aria-expanded={showCode}
      >
        <Code2 size={14} />
        {showCode ? "收起" : "展開"}虛擬碼
        <ChevronDown size={14} className={showCode ? "rotated" : ""} />
      </button>
      {showCode && (
        <ol className="pseudocode">
          {PSEUDOCODE[lane.algorithm].map((code, i) => (
            <li
              key={i}
              className={i === lane.line && status !== "idle" ? "current" : ""}
            >
              <span>{i + 1}</span>
              <code>{code}</code>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LearningNotes() {
  return (
    <div className="learning-page">
      <div className="section-kicker">
        <BookOpen size={15} /> THE FIELD GUIDE
      </div>
      <h1>從一步交換，理解一個演算法。</h1>
      <p className="learning-intro">
        勝負只是起點。試著改變資料分布，找出每種策略擅長的場景。
      </p>
      <div className="learning-grid">
        <article className="learning-card">
          <span className="learn-number">01 / DIVIDE & CONQUER</span>
          <h2>Quick Sort 快速排序</h2>
          <p>
            選擇區間最後一個值作為
            pivot，把較小或相等的值放到左邊，再遞迴處理左右區間。這裡使用 Lomuto
            partition。
          </p>
          <dl>
            <div>
              <dt>平均</dt>
              <dd>O(n log n)</dd>
            </div>
            <div>
              <dt>最差</dt>
              <dd>O(n²)</dd>
            </div>
            <div>
              <dt>適合觀察</dt>
              <dd>pivot 如何把問題切小</dd>
            </div>
          </dl>
          <p className="learning-tip">
            試試「已排序」：末端 pivot 經常無法均分區間，表現可能退化。Quick
            Sort 並不保證每次獲勝。
          </p>
        </article>
        <article className="learning-card">
          <span className="learn-number coral">02 / COMPARE & SWAP</span>
          <h2>Bubble Sort 氣泡排序</h2>
          <p>
            依序比較相鄰元素，將較大的值向右交換。每一輪結束後，右端會多一個已就位的元素；整輪沒有交換就提早結束。
          </p>
          <dl>
            <div>
              <dt>平均／最差</dt>
              <dd>O(n²)</dd>
            </div>
            <div>
              <dt>最佳</dt>
              <dd>O(n)</dd>
            </div>
            <div>
              <dt>適合觀察</dt>
              <dd>已排序尾端如何增長</dd>
            </div>
          </dl>
          <p className="learning-tip">
            試試「已排序」：只需要 n − 1 次比較、零次交換，即可確認全部完成。
          </p>
        </article>
      </div>
      <article className="rules-card">
        <Info size={21} />
        <div>
          <h3>這場比賽，究竟在比什麼？</h3>
          <p>
            兩側使用相同初始資料，每個節拍各播放一次比較或交換。比較只計算元素的大小比較，交換只計算不同索引的交換。操作步數＝比較＋交換，標記
            pivot 和已就位區域不額外計步。
          </p>
          <p>
            播放時間包含動畫延遲並排除暫停時間。它用來觀察播放進度，不能作為程式實際執行效能的測量。
          </p>
        </div>
      </article>
      <div className="experiment-ideas">
        <h3>
          <FlaskConical size={18} />
          三個小實驗
        </h3>
        <p>
          <b>01</b> 用相同 seed 重跑，改變速度，確認比較與交換次數不變。
        </p>
        <p>
          <b>02</b> 輸入 <code>3, 2, 1</code>，單步觀察 Bubble Sort 的 3
          次比較與 3 次交換。
        </p>
        <p>
          <b>03</b> 比較「隨機」「完全反向」「大量重複值」，思考 pivot
          的選擇造成什麼影響。
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"arena" | "learn">("arena");
  const [race, setRace] = useState<Race>(() =>
    makeRace(INITIAL, "ARENA-2026", "隨機分布"),
  );
  const raceRef = useRef(race);
  const clock = useRef({ elapsed: 0, accumulator: 0, last: 0 });
  const helpDialog = useRef<HTMLDialogElement>(null);
  const playbackPanel = useRef<HTMLElement>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speed, setSpeed] = useState(30);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [size, setSize] = useState(30);
  const [mode, setMode] = useState<DataMode>("random");
  const [seed, setSeed] = useState("ARENA-2026");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [replay, setReplay] = useState(false);
  const audio = useRef<SortAudio | null>(null);
  if (!audio.current) audio.current = new SortAudio();
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [volume, setVolume] = useState(25);
  const [source, setSource] = useState<Source>("both");
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const [helpOpen, setHelpOpen] = useState(false);

  const commit = useCallback((next: Race) => {
    raceRef.current = next;
    setRace(next);
  }, []);
  const reset = useCallback(
    (input?: number[], newSeed?: string, distribution?: string) => {
      audio.current?.stop();
      clock.current = { elapsed: 0, accumulator: 0, last: 0 };
      const current = raceRef.current;
      commit(
        makeRace(
          input ?? current.input,
          newSeed ?? current.seed,
          distribution ?? current.distribution,
        ),
      );
      setResult(null);
      setReplay(false);
      setError("");
    },
    [commit],
  );

  const advance = useCallback(
    (elapsed: number) => {
      const current = raceRef.current;
      const lanes = current.lanes.map((lane) => advanceLane(lane, elapsed)) as [
        Lane,
        Lane,
      ];
      const min = Math.min(...current.input),
        max = Math.max(...current.input);
      lanes.forEach((lane, i) => {
        if (lane.steps > current.lanes[i].steps && lane.lastOperation)
          audio.current?.play(
            lane.values[lane.active[0]] ?? min,
            min,
            max,
            lane.algorithm,
            lane.lastOperation,
            sourceRef.current,
          );
        if (lane.done && !current.lanes[i].done)
          audio.current?.complete(lane.algorithm, sourceRef.current);
      });
      const completed = lanes.every((lane) => lane.done);
      const next = {
        ...current,
        lanes,
        tick: current.tick + 1,
        elapsed,
        status: completed ? ("completed" as const) : current.status,
      };
      commit(next);
      return completed ? next : null;
    },
    [commit],
  );

  useEffect(() => {
    if (race.status !== "running") return;
    let frame = 0;
    clock.current.last = performance.now();
    const loop = (now: number) => {
      if (raceRef.current.status !== "running") return;
      const delta = Math.min(250, Math.max(0, now - clock.current.last));
      clock.current.last = now;
      clock.current.accumulator += delta;
      clock.current.elapsed += delta;
      const interval = 1000 / speedRef.current;
      while (clock.current.accumulator >= interval) {
        clock.current.accumulator -= interval;
        const finished = advance(clock.current.elapsed);
        if (finished) {
          setResult({
            lanes: finished.lanes,
            prediction,
            reason,
            seed: finished.seed,
            input: [...finished.input],
            distribution: finished.distribution,
          });
          return;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [race.status, advance, prediction, reason]);

  const togglePlay = useCallback(() => {
    const current = raceRef.current;
    if (current.status === "running") {
      const delta = Math.min(
        250,
        Math.max(0, performance.now() - clock.current.last),
      );
      clock.current.elapsed += delta;
      clock.current.accumulator += delta;
      clock.current.last = performance.now();
      audio.current?.stop();
      commit({ ...current, elapsed: clock.current.elapsed, status: "paused" });
    } else {
      clock.current.last = performance.now();
      if (current.status === "completed") {
        clock.current = { elapsed: 0, accumulator: 0, last: 0 };
        setResult(null);
        setReplay(false);
        commit({
          ...makeRace(current.input, current.seed, current.distribution),
          status: "running",
        });
      } else commit({ ...current, status: "running" });
    }
  }, [commit]);

  const singleStep = useCallback(() => {
    if (raceRef.current.status !== "paused") return;
    const finished = advance(raceRef.current.elapsed);
    if (finished)
      setResult({
        lanes: finished.lanes,
        prediction,
        reason,
        seed: finished.seed,
        input: [...finished.input],
        distribution: finished.distribution,
      });
  }, [advance, prediction, reason]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, a, [contenteditable="true"]',
        ) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        tab !== "arena" ||
        helpOpen
      )
        return;
      if (event.code === "Space" && !target.closest("button")) {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        singleStep();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [togglePlay, singleStep, tab, helpOpen]);

  useEffect(() => {
    const dialog = helpDialog.current;
    if (helpOpen && dialog && !dialog.open) dialog.showModal();
    else if (!helpOpen && dialog?.open) dialog.close();
  }, [helpOpen]);

  useEffect(() => {
    if (!playbackPanel.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setControlsVisible(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(playbackPanel.current);
    return () => observer.disconnect();
  }, [tab]);

  useEffect(
    () => () => {
      audio.current?.dispose();
    },
    [],
  );

  function applyData(randomize = false) {
    const nextSeed = randomize
      ? `ARENA-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`
      : seed.trim() || "ARENA-2026";
    setSeed(nextSeed);
    const input = generateData(
      size,
      mode === "sorted" ? "random" : mode,
      nextSeed,
    );
    if (mode === "sorted") input.sort((a, b) => a - b);
    reset(input, nextSeed, MODES[mode]);
  }

  function applyCustom() {
    try {
      const values = parseCustomData(custom);
      reset(values, "CUSTOM", "自訂資料");
      setCustomOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "資料格式有誤，請重新輸入。",
      );
    }
  }

  async function toggleSound() {
    if (sound) {
      audio.current?.disable();
      setSound(false);
    } else {
      audio.current?.setVolume(volume / 100);
      const enabled = await audio.current!.enable();
      setSound(enabled);
      setSoundError(
        enabled ? "" : "此瀏覽器目前無法啟用音效，仍可正常進行視覺化。",
      );
    }
  }

  function seek(step: number) {
    if (!result) return;
    audio.current?.stop();
    setReplay(true);
    commit({
      ...raceRef.current,
      lanes: [
        seekLane("quick", result.input, step),
        seekLane("bubble", result.input, step),
      ],
      tick: step,
      status: "completed",
    });
  }

  function exportResult() {
    if (!result) return;
    const data = {
      title: "Sort Arena 實驗結果",
      seed: result.seed,
      distribution: result.distribution,
      initialArray: result.input,
      prediction: result.prediction,
      reason: result.reason,
      counting:
        "操作步數 = 比較次數 + 不同索引的交換次數；播放時間不代表實際執行效能。",
      algorithms: result.lanes.map((l) => ({
        algorithm:
          l.algorithm === "quick"
            ? "Quick Sort (Lomuto, last pivot)"
            : "Bubble Sort (early exit)",
        comparisons: l.comparisons,
        swaps: l.swaps,
        steps: l.steps,
        playbackTimeMs: l.finishedAt,
        sortedArray: l.values,
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `sort-arena-${result.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const running = race.status === "running";
  const predictionLocked = race.status !== "idle";
  const winner: Prediction | null = result
    ? result.lanes[0].steps === result.lanes[1].steps
      ? "tie"
      : result.lanes[0].steps < result.lanes[1].steps
        ? "quick"
        : "bubble"
    : null;
  const winnerName =
    winner === "tie"
      ? "雙方平手"
      : winner === "quick"
        ? "Quick Sort 勝出"
        : "Bubble Sort 勝出";
  const maxSteps = result ? Math.max(...result.lanes.map((l) => l.steps)) : 0;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("arena");
          }}
          aria-label="Sort Arena 首頁"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            sort<span className="brand-light">arena</span>
            <span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="主要導覽">
          <button
            className={tab === "arena" ? "selected" : ""}
            onClick={() => setTab("arena")}
          >
            <FlaskConical size={15} />
            實驗場
          </button>
          <button
            className={tab === "learn" ? "selected" : ""}
            onClick={() => setTab("learn")}
          >
            <BookOpen size={15} />
            學習筆記
          </button>
        </nav>
        <button
          className="icon-button keyboard-button"
          aria-label="鍵盤快捷鍵說明"
          onClick={() => setHelpOpen(!helpOpen)}
        >
          <Keyboard size={19} />
          <span>快捷鍵</span>
        </button>
      </header>
      <main>
        {tab === "learn" ? (
          <LearningNotes />
        ) : (
          <>
            <div className="page-intro">
              <div>
                <div className="section-kicker">
                  <span className="live-dot" /> INTERACTIVE SORTING LAB
                </div>
                <h1>
                  讓演算法，<span>跑給你看。</span>
                </h1>
                <p>同一份資料，兩種排序策略。看見每一步，也聽見每個數值。</p>
              </div>
              <div className="intro-tag">
                <span>QUICK SORT</span>
                <b>vs.</b>
                <span>BUBBLE SORT</span>
                <span className="tag-dot" />
              </div>
            </div>

            <section className="data-panel" aria-label="資料設定">
              <div className="panel-topline">
                <h2>
                  <Dices size={16} />
                  設定你的實驗
                </h2>
                <button
                  className="text-button"
                  disabled={running}
                  onClick={() => {
                    setCustomOpen(!customOpen);
                    setError("");
                  }}
                >
                  <Code2 size={14} />
                  自訂陣列
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="data-controls">
                <label className="distribution-field">
                  資料分布
                  <div className="select-wrap">
                    <select
                      value={mode}
                      disabled={running}
                      onChange={(e) => setMode(e.target.value as DataMode)}
                    >
                      {Object.entries(MODES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </div>
                </label>
                <label className="size-field">
                  <span>
                    元素數量 <b>{size}</b>
                  </span>
                  <div className="range-field">
                    <span>10</span>
                    <input
                      aria-label="元素數量"
                      type="range"
                      min="10"
                      max="100"
                      value={size}
                      disabled={running}
                      onChange={(e) => setSize(+e.target.value)}
                    />
                    <span>100</span>
                  </div>
                </label>
                <label className="seed-field">
                  隨機種子 Seed
                  <input
                    value={seed}
                    maxLength={40}
                    disabled={running}
                    onChange={(e) => setSeed(e.target.value)}
                    aria-label="隨機種子 Seed"
                  />
                </label>
                <div className="generate-actions">
                  <button
                    className="secondary-button apply-button"
                    disabled={running}
                    onClick={() => applyData()}
                  >
                    <Layers3 size={15} />
                    套用資料
                  </button>
                  <button
                    className="icon-button shuffle-button"
                    disabled={running}
                    onClick={() => applyData(true)}
                    aria-label="隨機換一組資料"
                    title="使用新 seed 隨機換一組"
                  >
                    <Shuffle size={17} />
                  </button>
                </div>
              </div>
              {customOpen && (
                <div className="custom-editor">
                  <label htmlFor="custom-array">
                    輸入 2～100 個整數（1～100），以逗號分隔
                  </label>
                  <div>
                    <input
                      id="custom-array"
                      placeholder="例如：42, 8, 65, 23, 91, 16"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      disabled={running}
                      aria-describedby={error ? "custom-error" : undefined}
                      aria-invalid={!!error}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyCustom();
                      }}
                    />
                    <button
                      className="secondary-button"
                      disabled={running}
                      onClick={applyCustom}
                    >
                      載入陣列
                    </button>
                  </div>
                  {error && (
                    <p role="alert" id="custom-error">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="prediction-panel" aria-label="賽前預測">
              <div className="prediction-prompt">
                <span className="sparkle-box">
                  <Sparkles size={18} />
                </span>
                <div>
                  <h2>先猜猜，誰會更快？</h2>
                  <p>預測誰用更少操作完成排序</p>
                </div>
              </div>
              <div className="prediction-options">
                {(
                  [
                    ["quick", "Quick Sort"],
                    ["bubble", "Bubble Sort"],
                    ["tie", "平手"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    disabled={predictionLocked}
                    className={prediction === value ? `chosen ${value}` : ""}
                    aria-pressed={prediction === value}
                    onClick={() =>
                      setPrediction(prediction === value ? null : value)
                    }
                  >
                    {prediction === value && <Check size={13} />}
                    {label}
                  </button>
                ))}
              </div>
              <input
                className="reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={120}
                placeholder="你的理由？（選填）"
                aria-label="預測理由"
                disabled={predictionLocked}
              />
            </section>

            <div className="arena-topline">
              <div>
                <span className={`status-dot ${running ? "pulsing" : ""}`} />
                <h2>雙演算法競技場</h2>
                <span className="race-mode">SPLIT-SCREEN RACE</span>
              </div>
              <span className="current-data">
                {race.distribution}
                <span>·</span>
                {race.input.length} 個元素<span>·</span>
                <code>{race.seed}</code>
              </span>
            </div>
            <div className="race-grid">
              {race.lanes.map((lane, index) => (
                <LanePanel
                  key={lane.algorithm}
                  lane={lane}
                  status={race.status}
                  index={index}
                  elapsed={race.elapsed}
                  replay={replay}
                  originalTime={result?.lanes[index].finishedAt}
                />
              ))}
              <span className="versus-badge">VS</span>
            </div>
            <div className="arena-legend">
              <div>
                <span>
                  <i className="legend-normal" />
                  待排序
                </span>
                <span>
                  <i className="legend-active" />
                  正在比較／交換
                </span>
                <span>
                  <i className="legend-pivot" />
                  Pivot ▾
                </span>
                <span>
                  <i className="legend-sorted" />
                  已就位 ━
                </span>
              </div>
              <p>
                <GitCompareArrows size={13} />
                相同資料・相同節拍・每次操作算一步
              </p>
            </div>

            <section
              className="playback-panel"
              ref={playbackPanel}
              aria-label="播放控制"
            >
              <div className="playback-main">
                <div className="transport">
                  <button
                    className={`play-button ${running ? "is-running" : ""}`}
                    onClick={togglePlay}
                  >
                    {running ? (
                      <Pause size={17} fill="currentColor" />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                    {running
                      ? "暫停競賽"
                      : race.status === "paused"
                        ? "繼續競賽"
                        : race.status === "completed"
                          ? "再比一次"
                          : "開始競賽"}
                    <kbd>Space</kbd>
                  </button>
                  <button
                    className="secondary-button step-button"
                    disabled={race.status !== "paused"}
                    onClick={singleStep}
                    title="暫停後使用右方向鍵單步執行"
                  >
                    <SkipForward size={16} />
                    單步
                  </button>
                  <button
                    className="icon-button reset-button"
                    onClick={() => reset()}
                    title="重跑同一份資料"
                    aria-label="重設同一份資料"
                  >
                    <RotateCcw size={17} />
                  </button>
                </div>
                <div className="speed-control">
                  <label htmlFor="speed">
                    <Gauge size={15} />
                    播放速度
                    <span>
                      <b>{speed}</b> 步／秒
                    </span>
                  </label>
                  <div>
                    <span>慢</span>
                    <input
                      id="speed"
                      type="range"
                      min="1"
                      max="60"
                      value={speed}
                      onChange={(e) => {
                        const value = +e.target.value;
                        const progress = Math.min(
                          1,
                          clock.current.accumulator / (1000 / speedRef.current),
                        );
                        clock.current.accumulator = progress * (1000 / value);
                        speedRef.current = value;
                        setSpeed(value);
                      }}
                    />
                    <span>快</span>
                  </div>
                </div>
                <div className="playback-status">
                  <span className={`status-dot ${running ? "pulsing" : ""}`} />
                  {STATUS[race.status]}
                  <span className="step-count">
                    STEP {format(race.tick).padStart(3, "0")}
                  </span>
                </div>
              </div>
              <div className="audio-controls">
                <button
                  onClick={toggleSound}
                  className={`sound-toggle ${sound ? "on" : ""}`}
                  aria-pressed={sound}
                >
                  {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  排序音效
                  <span className="toggle-track">
                    <i />
                  </span>
                </button>
                <div className="volume-control">
                  <label htmlFor="volume">音量</label>
                  <input
                    id="volume"
                    aria-label="音量"
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => {
                      setVolume(+e.target.value);
                      audio.current?.setVolume(+e.target.value / 100);
                    }}
                  />
                  <span>{volume}%</span>
                </div>
                <label className="audio-source">
                  聲音來源
                  <select
                    aria-label="聲音來源"
                    value={source}
                    onChange={(e) => {
                      audio.current?.stop();
                      setSource(e.target.value as Source);
                    }}
                  >
                    <option value="both">雙側 · 立體聲</option>
                    <option value="quick">Quick Sort</option>
                    <option value="bubble">Bubble Sort</option>
                  </select>
                </label>
                <span className="audio-hint">
                  <AudioLines size={14} />
                  數值越高，音調越高
                </span>
              </div>
              {soundError && (
                <p className="audio-error" role="status">
                  {soundError}
                </p>
              )}
            </section>

            {result ? (
              <section className="result-panel" aria-label="競賽結果">
                <div className="result-top">
                  <div className="result-heading">
                    <span className="trophy-icon">
                      <Trophy size={24} />
                    </span>
                    <div>
                      <div className="section-kicker">RACE COMPLETE</div>
                      <h2>
                        {winnerName}
                        <span>以操作步數計算</span>
                      </h2>
                    </div>
                  </div>
                  <button className="secondary-button" onClick={exportResult}>
                    <Download size={15} />
                    匯出結果 JSON
                  </button>
                </div>
                <div className="result-comparison">
                  {result.lanes.map((l) => (
                    <div key={l.algorithm} className={l.algorithm}>
                      <span>
                        {l.algorithm === "quick" ? "Quick Sort" : "Bubble Sort"}
                      </span>
                      <div className="result-bar-track">
                        <div
                          style={{
                            width: `${Math.max(1, (l.steps / maxSteps) * 100)}%`,
                          }}
                        />
                      </div>
                      <strong>
                        {format(l.steps)}
                        <small> 步</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="result-message">
                  {result.prediction
                    ? result.prediction === winner
                      ? "預測命中！"
                      : "這次結果和預測不同，再換一組資料觀察看看。"
                    : "下次試著在開始前預測勝負。"}{" "}
                  {result.distribution === "已排序" ||
                  result.distribution === "接近排序"
                    ? "已排序資料能讓 Bubble Sort 提早結束；末端 pivot 的 Quick Sort 則可能產生不均衡分割。"
                    : "結果會隨資料分布與 pivot 策略改變，試著調整輸入，探索兩種策略的差異。"}
                </p>
                {result.reason && (
                  <p className="prediction-reason">
                    你的預測理由：{result.reason}
                  </p>
                )}
                <div className="replay-control">
                  <label htmlFor="replay">
                    <RotateCcw size={14} />
                    回看每一步
                    <span>
                      {race.tick} / {maxSteps}
                    </span>
                  </label>
                  <input
                    id="replay"
                    aria-label="排序回放進度"
                    type="range"
                    min="0"
                    max={maxSteps}
                    value={race.tick}
                    onChange={(e) => seek(+e.target.value)}
                  />
                  <span>拖曳靜音回放 · 結果統計保留</span>
                </div>
              </section>
            ) : (
              <section className="insight-panel">
                <span className="insight-icon">
                  <FlaskConical size={22} />
                </span>
                <div>
                  <div className="section-kicker">A LITTLE EXPERIMENT</div>
                  <h3>Quick Sort，一定比較快嗎？</h3>
                  <p>
                    試試「已排序」資料。當 pivot
                    總是落在區間末端，快速排序也可能遇上它的最差情況。
                  </p>
                </div>
                <button className="text-button" onClick={() => setTab("learn")}>
                  探索原理
                  <ArrowRight size={15} />
                </button>
              </section>
            )}
            <p className="fairness-note">
              <Info size={13} />
              此處比較操作步數。播放時間包含視覺化延遲，不能代表演算法實際執行效能。
            </p>
          </>
        )}
      </main>
      <footer>
        <span className="footer-brand">
          sortarena<span>.</span>
        </span>
        <p>把抽象變具體，把學習變有趣。</p>
        <span>
          BUILT FOR CURIOSITY <Sparkles size={12} />
        </span>
      </footer>
      {tab === "arena" &&
        !controlsVisible &&
        (running || race.status === "paused") && (
          <aside className="floating-playback" aria-label="浮動播放控制">
            <span>
              <span className="status-dot" />
              STEP {format(race.tick).padStart(3, "0")}
            </span>
            <button
              onClick={togglePlay}
              aria-label={running ? "暫停播放" : "繼續播放"}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
              {running ? "暫停" : "繼續"}
            </button>
            <button
              onClick={singleStep}
              disabled={race.status !== "paused"}
              aria-label="浮動單步執行"
            >
              <SkipForward size={15} />
              單步
            </button>
          </aside>
        )}
      <dialog
        ref={helpDialog}
        className="help-dialog"
        aria-labelledby="help-title"
        onCancel={() => setHelpOpen(false)}
        onClose={() => setHelpOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
            ),
          );
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div>
          <h2 id="help-title">
            <Keyboard size={20} />
            鍵盤快捷鍵
          </h2>
          <button
            autoFocus
            className="icon-button"
            aria-label="關閉快捷鍵說明"
            onClick={() => setHelpOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <p>
          <kbd>Space</kbd>
          <span>開始、暫停或繼續競賽</span>
        </p>
        <p>
          <kbd>→</kbd>
          <span>暫停時，兩側各前進一步</span>
        </p>
        <p>
          <kbd>Tab</kbd>
          <span>依序移動到各個控制項</span>
        </p>
        <small>輸入欄位保留原本行為；按鈕上的空白鍵會啟動該按鈕。</small>
      </dialog>
    </div>
  );
}
