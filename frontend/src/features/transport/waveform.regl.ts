import createREGL from "regl";

const ZOOM_KEYS = ["z256", "z512", "z1024", "z2048", "z4096"] as const;
const ZOOM_COUNTS = [256, 512, 1024, 2048, 4096] as const;

/** Pack interleaved [min,max,...] peaks into an RGBA Uint8 texture row. */
function packPeaks(peaks: number[], count: number): Uint8Array {
  const buf = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    // map -1..1 → 0..255
    buf[i * 4 + 0] = Math.round(Math.min(1, Math.max(-1, peaks[i * 2])) * 127.5 + 127.5);
    buf[i * 4 + 1] = Math.round(Math.min(1, Math.max(-1, peaks[i * 2 + 1])) * 127.5 + 127.5);
    buf[i * 4 + 2] = 0;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

/** Pick the zoom level whose column count is closest to the canvas CSS width. */
function pickZoomIdx(cssWidth: number): number {
  const target = Math.log2(Math.max(1, cssWidth));
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < ZOOM_COUNTS.length; i++) {
    const diff = Math.abs(Math.log2(ZOOM_COUNTS[i]) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export interface DrawParams {
  scroll: number;    // seconds from audio start
  secPerPx: number;  // seconds per CSS pixel
  duration: number;  // total audio duration in seconds
  color: [number, number, number]; // RGB in 0..1
  offsetPx: number;  // horizontal shift in CSS pixels (B lane alignment)
}

export interface WaveformRenderer {
  draw(params: DrawParams): void;
  destroy(): void;
}

const VERT = `
  attribute vec2 pos;
  varying vec2 vUv;
  void main() {
    vUv = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  uniform sampler2D uPeaks;
  uniform float uCount;
  uniform float uScroll;
  uniform float uSecPerPx;
  uniform float uDuration;
  uniform float uCanvasW;
  uniform float uOffsetPx;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    // CSS pixel this fragment corresponds to, adjusted for B-lane offset
    float cssPx = vUv.x * uCanvasW - uOffsetPx;
    float t = uScroll + cssPx * uSecPerPx;

    if (t < 0.0 || t >= uDuration) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Sample peak at this time
    float norm = clamp(t / uDuration, 0.0, 1.0 - 1.0 / uCount);
    float tx = (floor(norm * uCount) + 0.5) / uCount;
    vec4 s = texture2D(uPeaks, vec2(tx, 0.5));
    // decode: 0..1 texel → -1..1 amplitude
    float pMin = s.r * 2.0 - 1.0;
    float pMax = s.g * 2.0 - 1.0;

    // vUv.y: 0=bottom → -1, 1=top → +1
    float amp = vUv.y * 2.0 - 1.0;

    if (amp < pMin || amp > pMax) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Brighter toward the peak midline
    float span = max(pMax - pMin, 0.001);
    float mid = 1.0 - clamp(2.0 * abs(amp - (pMax + pMin) * 0.5) / span, 0.0, 1.0);
    float alpha = 0.48 + mid * 0.32;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

export function createWaveformRenderer(
  canvas: HTMLCanvasElement,
  peaks: Record<string, number[]>,
): WaveformRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regl = createREGL({ canvas, attributes: { antialias: false, alpha: true } }) as any;

  const textures = ZOOM_KEYS.map((key, i) => {
    const data = peaks[key];
    if (!data || data.length < ZOOM_COUNTS[i] * 2) return null;
    return regl.texture({
      width: ZOOM_COUNTS[i],
      height: 1,
      format: "rgba",
      type: "uint8",
      data: packPeaks(data, ZOOM_COUNTS[i]),
      min: "nearest",
      mag: "nearest",
      wrapS: "clamp",
      wrapT: "clamp",
    });
  });

  const drawCmd = regl({
    vert: VERT,
    frag: FRAG,
    attributes: { pos: [[-1, -1], [1, -1], [-1, 1], [1, 1]] },
    uniforms: {
      uPeaks: regl.prop("uPeaks"),
      uCount: regl.prop("uCount"),
      uScroll: regl.prop("uScroll"),
      uSecPerPx: regl.prop("uSecPerPx"),
      uDuration: regl.prop("uDuration"),
      uCanvasW: regl.prop("uCanvasW"),
      uOffsetPx: regl.prop("uOffsetPx"),
      uColor: regl.prop("uColor"),
    },
    primitive: "triangle strip",
    count: 4,
    blend: {
      enable: true,
      func: {
        srcRGB: "src alpha",
        srcAlpha: 1,
        dstRGB: "one minus src alpha",
        dstAlpha: 1,
      },
    },
    depth: { enable: false },
  });

  return {
    draw({ scroll, secPerPx, duration, color, offsetPx }) {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const zi = pickZoomIdx(cssW);
      const tex = textures[zi];
      if (!tex) return;

      regl.clear({ color: [0, 0, 0, 0] });
      drawCmd({
        uPeaks: tex,
        uCount: ZOOM_COUNTS[zi],
        uScroll: scroll,
        uSecPerPx: secPerPx,
        uDuration: duration,
        uCanvasW: cssW,
        uOffsetPx: offsetPx,
        uColor: color,
      });
    },

    destroy() {
      textures.forEach((t) => t?.destroy());
      regl.destroy();
    },
  };
}
