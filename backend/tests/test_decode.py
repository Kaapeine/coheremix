import numpy as np
import pytest

from app.analysis.decode import (
    DecodeError, decode_to_48k, probe, validate_stereo,
)


def test_probe_reads_stereo_44k(stereo_wav):
    path, size = stereo_wav
    info = probe(path, size)
    assert info.channels == 2
    assert info.sampleRate == 44100
    assert info.duration == pytest.approx(2.0, abs=0.05)
    assert info.size == size


def test_decode_resamples_to_48k_stereo(stereo_wav):
    path, _ = stereo_wav
    pcm = decode_to_48k(path)
    assert pcm.shape[0] == 2
    # 2.0 s at 48 kHz ≈ 96000 samples per channel
    assert pcm.shape[1] == pytest.approx(96000, rel=0.02)
    assert pcm.dtype == np.float32
    assert np.abs(pcm).max() <= 1.0


def test_validate_rejects_mono(mono_wav):
    path, size = mono_wav
    info = probe(path, size)
    with pytest.raises(DecodeError, match="Stereo"):
        validate_stereo(info)
