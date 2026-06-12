import numpy as np
import pytest
import soundfile as sf


@pytest.fixture
def stereo_wav(tmp_path):
    sr, dur = 44100, 2.0
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    left = 0.5 * np.sin(2 * np.pi * 440 * t)
    right = 0.5 * np.sin(2 * np.pi * 445 * t)
    path = tmp_path / "stereo.wav"
    sf.write(path, np.stack([left, right], axis=1), sr, subtype="PCM_16")
    return str(path), path.stat().st_size


@pytest.fixture
def mono_wav(tmp_path):
    sr, dur = 44100, 1.0
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    path = tmp_path / "mono.wav"
    sf.write(path, 0.5 * np.sin(2 * np.pi * 440 * t), sr, subtype="PCM_16")
    return str(path), path.stat().st_size
