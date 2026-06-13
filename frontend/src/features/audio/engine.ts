export interface EngineLoad {
  mixUrl: string;
  refUrl: string;
}

interface Voice {
  buffer: AudioBuffer;
  gain: GainNode;
  src: AudioBufferSourceNode | null;
}

/**
 * Two buffers play in lock-step through per-voice gain nodes; muting the
 * inaudible voice gives instant, gain-matched A/B. B is positioned at
 * position + offsetB. Match-mode crossfades + frame-perfect loop are P4.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mix: Voice | null = null;
  private ref: Voice | null = null;

  // playback bookkeeping (all in A-time seconds)
  private startedAtCtx = 0; // ctx.currentTime when current play() began
  private startPos = 0; // A-time at that ctx instant
  private _playing = false;

  // live params (updated from the store)
  private offsetB = 0;
  private ab: "A" | "B" = "A";
  private mixGainLin = 1; // 10^(offsetToCommon/20)
  private refGainLin = 1;
  private matchOn = true;

  onEnded: (() => void) | null = null;

  get playing() {
    return this._playing;
  }

  async load(load: EngineLoad): Promise<number> {
    this.ctx = new AudioContext();
    const [mixBuf, refBuf] = await Promise.all([
      this.fetchDecode(load.mixUrl),
      this.fetchDecode(load.refUrl),
    ]);
    const mkVoice = (buffer: AudioBuffer): Voice => {
      const gain = this.ctx!.createGain();
      gain.connect(this.ctx!.destination);
      gain.gain.value = 0;
      return { buffer, gain, src: null };
    };
    this.mix = mkVoice(mixBuf);
    this.ref = mkVoice(refBuf);
    this.applyGains();
    return Math.max(mixBuf.duration, refBuf.duration);
  }

  private async fetchDecode(url: string): Promise<AudioBuffer> {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const bytes = await res.arrayBuffer();
    return await this.ctx!.decodeAudioData(bytes);
  }

  /** offsetToCommon is in LU/dB; convert to linear and store. */
  setGainMatch(mixOffsetDb: number, refOffsetDb: number) {
    this.mixGainLin = Math.pow(10, mixOffsetDb / 20);
    this.refGainLin = Math.pow(10, refOffsetDb / 20);
    this.applyGains();
  }

  setMatch(on: boolean) {
    this.matchOn = on;
    this.applyGains();
  }

  setAB(ab: "A" | "B") {
    this.ab = ab;
    this.applyGains();
  }

  setOffsetB(offsetB: number) {
    const wasPlaying = this._playing;
    const pos = this.time();
    this.offsetB = offsetB;
    if (wasPlaying) this.play(pos); // re-sync B position
  }

  private applyGains() {
    if (!this.mix || !this.ref) return;
    const mg = this.matchOn ? this.mixGainLin : 1;
    const rg = this.matchOn ? this.refGainLin : 1;
    this.mix.gain.gain.value = this.ab === "A" ? mg : 0;
    this.ref.gain.gain.value = this.ab === "B" ? rg : 0;
  }

  /** Current A-time. */
  time(): number {
    if (!this.ctx || !this._playing) return this.startPos;
    return this.startPos + (this.ctx.currentTime - this.startedAtCtx);
  }

  /** (Re)start both voices so A-time = pos. Stops any current sources first. */
  play(pos: number) {
    if (!this.ctx || !this.mix || !this.ref) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.stopSources();
    const startVoice = (v: Voice, at: number) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = v.buffer;
      src.connect(v.gain);
      const clamped = Math.max(0, Math.min(at, v.buffer.duration));
      src.start(this.ctx!.currentTime, clamped);
      v.src = src;
    };
    startVoice(this.mix, pos);
    startVoice(this.ref, pos + this.offsetB);
    this.startedAtCtx = this.ctx.currentTime;
    this.startPos = pos;
    this._playing = true;
    this.applyGains();
  }

  pause() {
    const pos = this.time();
    this.stopSources();
    this._playing = false;
    this.startPos = pos;
  }

  /** Move the parked playhead (no audio while paused). */
  seek(pos: number) {
    if (this._playing) this.play(pos);
    else this.startPos = pos;
  }

  private stopSources() {
    for (const v of [this.mix, this.ref]) {
      if (v?.src) {
        try {
          v.src.onended = null;
          v.src.stop();
        } catch {
          /* already stopped */
        }
        v.src.disconnect();
        v.src = null;
      }
    }
  }

  dispose() {
    this.stopSources();
    void this.ctx?.close();
    this.ctx = null;
    this.mix = null;
    this.ref = null;
  }
}
