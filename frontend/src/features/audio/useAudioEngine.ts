import { useEffect, useLayoutEffect, useRef } from "react";
import { useViewState } from "../../store/viewState";
import { api } from "../../api/client";
import { AudioEngine } from "./engine";
import { audioTap } from "./tap";
import type { TrackPayload } from "../../types/payload";

interface Args {
  compId: string;
  mix: TrackPayload;
  ref: TrackPayload;
  playing: boolean;
  setPlaying: (v: boolean) => void;
}

interface Return {
  /** Resume the AudioContext — call synchronously inside a user-gesture handler. */
  touch: () => void;
  /** Seek to t (seconds): updates both the engine clock and the store playhead. */
  seekTo: (t: number) => void;
}

export function useAudioEngine({ compId, mix, ref, playing, setPlaying }: Args): Return {
  const engineRef = useRef<AudioEngine | null>(null);
  const readyRef = useRef(false);
  const playingRef = useRef(playing);
  const store = useViewState();
  const storeRef = useRef(store);

  useLayoutEffect(() => {
    playingRef.current = playing;
    storeRef.current = store;
  });

  // Load buffers once per comparison.
  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;
    readyRef.current = false;
    engine
      .load({
        mixUrl: api.audioUrl(compId, "mix"),
        refUrl: api.audioUrl(compId, "reference"),
      })
      .then(() => {
        engine.setGainMatch(
          mix.gainMatch.offsetToCommon,
          ref.gainMatch.offsetToCommon,
        );
        engine.setOffsetB(storeRef.current.offsetB);
        engine.setAB(storeRef.current.ab);
        engine.setMatch(storeRef.current.matchMode !== "off");
        // Sync engine position to wherever the store/UI thinks the playhead is.
        engine.seek(storeRef.current.playhead);
        readyRef.current = true;
        audioTap.set(engine);
        // User may have pressed play before the buffers were ready.
        if (playingRef.current) {
          engine.resume();
        }
      })
      .catch(() => {
        readyRef.current = false;
      });
    return () => {
      audioTap.set(null);
      engine.dispose();
      engineRef.current = null;
    };
  }, [compId, mix, ref]);

  // Play / pause — resume from the engine's own internal position (set by seek).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !readyRef.current) return;
    if (playing) engine.resume();
    else engine.pause();
  }, [playing]);

  // Push reactive params into the engine.
  useEffect(() => {
    engineRef.current?.setAB(store.ab);
  }, [store.ab]);
  useEffect(() => {
    engineRef.current?.setOffsetB(store.offsetB);
  }, [store.offsetB]);
  useEffect(() => {
    engineRef.current?.setMatch(store.matchMode !== "off");
  }, [store.matchMode]);

  // Clock loop: read engine time -> store.playhead, region loop, auto-follow.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const engine = engineRef.current;
      const s = storeRef.current;
      if (engine) {
        let p = engine.time();
        if (s.loop.enabled && s.regionA && p >= s.regionA[1]) {
          p = s.regionA[0];
          engine.play(p);
        }
        if (p >= s.duration) {
          engine.pause();
          setPlaying(false);
          s.set({ playhead: s.duration });
          return;
        }
        const spanPx = 900;
        const span = spanPx * s.secPerPx;
        let scroll = s.scroll;
        if (p > s.scroll + span * 0.88) scroll = p - span * 0.5;
        if (p < s.scroll) scroll = Math.max(0, p - span * 0.1);
        s.set({ playhead: p, scroll });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlaying]);

  return {
    touch: () => engineRef.current?.touch(),
    seekTo: (t: number) => {
      storeRef.current.set({ playhead: t });
      engineRef.current?.seek(t);
    },
  };
}
