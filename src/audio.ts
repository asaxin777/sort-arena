type Algorithm = 'quick' | 'bubble';
type SoundSource = 'both' | Algorithm;
type SoundKind = 'compare' | 'swap';

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
}

/** Small, optional audio layer. No sorting state or timing depends on this class. */
export class SortAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = false;
  private volume = 0.35;
  private generation = 0;
  private voices = new Set<Voice>();
  private lastPlayed: Record<Algorithm, number> = {
    quick: -Infinity,
    bubble: -Infinity,
  };

  get enabled(): boolean {
    return this.active && this.context?.state === 'running';
  }

  /** Call from a click/keyboard handler so browser autoplay rules are respected. */
  async enable(): Promise<boolean> {
    const generation = ++this.generation;
    try {
      if (typeof window === 'undefined') return false;
      const audioWindow = window as Window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const Context = window.AudioContext ?? audioWindow.webkitAudioContext;
      if (!Context) return false;

      if (!this.context || this.context.state === 'closed') {
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume * 0.22;
        this.master.connect(this.context.destination);
      }
      if (this.context.state !== 'running') await this.context.resume();
      // A pending resume must not re-enable audio after the user has disabled it.
      if (generation !== this.generation) return false;
      this.active = this.context.state === 'running';
      return this.active;
    } catch {
      if (generation === this.generation) {
        this.active = false;
        this.stop();
      }
      return false;
    }
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      if (this.context && this.master && this.context.state !== 'closed') {
        this.master.gain.setTargetAtTime(
          this.volume * 0.22,
          this.context.currentTime,
          0.015,
        );
      }
    } catch {
      // A browser can close an audio context independently of the application.
    }
  }

  play(
    value: number,
    min: number,
    max: number,
    algorithm: Algorithm,
    kind: SoundKind,
    source: SoundSource,
  ): void {
    if (!this.enabled || (source !== 'both' && source !== algorithm)) return;
    if (![value, min, max].every(Number.isFinite)) return;
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    if (now - this.lastPlayed[algorithm] < 0.05) return;
    this.lastPlayed[algorithm] = now;
    const t = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0.5;
    const frequency = 220 * Math.pow(4, t);
    this.tone(frequency, now, kind === 'swap' ? 0.095 : 0.065, algorithm, source, kind);
  }

  complete(algorithm: Algorithm, source: SoundSource): void {
    if (!this.enabled || (source !== 'both' && source !== algorithm)) return;
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    // Schedule within Web Audio, rather than timers, so stop() cancels every note.
    [440, 554.365, 659.255].forEach((frequency, index) => {
      this.tone(frequency, now + index * 0.075, 0.16, algorithm, source, 'compare');
    });
  }

  /** Silence current and future scheduled notes, without changing the user's setting. */
  stop(): void {
    for (const voice of [...this.voices]) this.release(voice);
    this.lastPlayed = { quick: -Infinity, bubble: -Infinity };
  }

  disable(): void {
    this.generation++;
    this.active = false;
    this.stop();
  }

  dispose(): void {
    this.disable();
    try {
      this.master?.disconnect();
      if (this.context && this.context.state !== 'closed') {
        void this.context.close().catch(() => undefined);
      }
    } catch {
      // Disposal is safe even after browser-driven context shutdown.
    }
    this.master = null;
    this.context = null;
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    algorithm: Algorithm,
    source: SoundSource,
    kind: SoundKind,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    let oscillator: OscillatorNode | undefined;
    let gain: GainNode | undefined;
    let panner: StereoPannerNode | null = null;
    let voice: Voice | undefined;
    try {
      // Both algorithms and completion notes share the same hard voice limit.
      if (this.voices.size >= 8) {
        const oldest = this.voices.values().next().value;
        if (oldest) this.release(oldest);
      }
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = kind === 'swap' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);

      if (typeof context.createStereoPanner === 'function') {
        panner = context.createStereoPanner();
        panner.pan.value = source === 'both' ? (algorithm === 'quick' ? -0.55 : 0.55) : 0;
        gain.connect(panner);
        panner.connect(master);
      } else {
        gain.connect(master);
      }

      voice = { oscillator, gain, panner };
      const playingVoice = voice;
      this.voices.add(voice);
      oscillator.onended = () => this.release(playingVoice);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    } catch {
      // Missing/closed audio devices must never interrupt the visualizer.
      if (voice) this.release(voice);
      else if (oscillator && gain) this.release({ oscillator, gain, panner });
      else {
        try { oscillator?.disconnect(); } catch { /* already disconnected */ }
        try { gain?.disconnect(); } catch { /* already disconnected */ }
      }
    }
  }

  private release(voice: Voice): void {
    this.voices.delete(voice);
    voice.oscillator.onended = null;
    try { voice.oscillator.stop(); } catch { /* already stopped */ }
    try { voice.oscillator.disconnect(); } catch { /* already disconnected */ }
    try { voice.gain.disconnect(); } catch { /* already disconnected */ }
    try { voice.panner?.disconnect(); } catch { /* already disconnected */ }
  }
}
