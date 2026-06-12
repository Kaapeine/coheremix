from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass

import numpy as np

from app.config import get_settings


class DecodeError(Exception):
    pass


@dataclass
class FileInfo:
    format: str
    sampleRate: int
    bitDepth: int | None
    channels: int
    size: int
    duration: float


def probe(path: str, size: int) -> FileInfo:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise DecodeError(f"ffprobe failed: {out.stderr.strip()}")
    info = json.loads(out.stdout)
    audio = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if audio is None:
        raise DecodeError("no audio stream")
    fmt = info["format"]
    bits = audio.get("bits_per_raw_sample") or audio.get("bits_per_sample")
    return FileInfo(
        format=(fmt.get("format_name", "?").split(",")[0]).upper(),
        sampleRate=int(audio.get("sample_rate", 0)),
        bitDepth=int(bits) if bits else None,
        channels=int(audio.get("channels", 0)),
        size=size,
        duration=float(fmt.get("duration", 0.0)),
    )


def decode_to_48k(path: str, target_sr: int | None = None) -> np.ndarray:
    """Decode any supported file to float32 stereo PCM, shape (2, n).

    Resamples to ``target_sr`` (defaults to ``analysis_sample_rate`` from
    config, currently 48 kHz).
    """
    sr = target_sr if target_sr is not None else get_settings().analysis_sample_rate
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path,
         "-ac", "2", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise DecodeError(f"ffmpeg failed: {proc.stderr.decode().strip()}")
    interleaved = np.frombuffer(proc.stdout, dtype=np.float32)
    if interleaved.size == 0:
        raise DecodeError("empty decode")
    return interleaved.reshape(-1, 2).T.copy()  # (2, n)


def validate_stereo(info: FileInfo) -> None:
    if info.channels != 2:
        raise DecodeError(
            f"Stereo files only — got {info.channels} channel(s)."
        )
