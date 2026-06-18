import type { AudioEngine } from "./engine";

/**
 * Module-level handle to the live AudioEngine so panels deep in the tree
 * (spectrum, goniometer) can read AnalyserNode taps without prop-drilling or a
 * context. useAudioEngine registers/unregisters the active engine.
 */
let current: AudioEngine | null = null;

export const audioTap = {
  set(engine: AudioEngine | null) {
    current = engine;
  },
  analyser(role: "mix" | "reference"): AnalyserNode | null {
    return current?.getAnalyser(role) ?? null;
  },
  stereo(role: "mix" | "reference") {
    return current?.getStereoAnalysers(role) ?? null;
  },
  sampleRate(): number {
    return current?.sampleRate() ?? 48000;
  },
};
