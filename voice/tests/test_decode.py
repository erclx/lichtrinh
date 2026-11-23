import numpy as np
import pytest
from clips import encode_tone, encode_video_only

from voice.decode import SAMPLE_RATE, ClipError, decode


@pytest.mark.parametrize(
    ('container', 'codec'),
    [('webm', 'libopus'), ('mp4', 'aac')],
    ids=['webm-opus', 'mp4-aac'],
)
def test_decodes_a_phone_clip_to_16k_mono_float32(container: str, codec: str) -> None:
    clip = encode_tone(2.0, container, codec)

    samples = decode(clip)

    assert samples.dtype == np.float32
    assert samples.ndim == 1
    # Encoder priming and padding shift the length by a few milliseconds.
    assert abs(len(samples) - 2 * SAMPLE_RATE) < SAMPLE_RATE * 0.05
    assert 0.1 < float(np.abs(samples).max()) <= 1.0


def test_accepts_a_clip_just_under_the_limit() -> None:
    clip = encode_tone(9.9)

    samples = decode(clip, max_seconds=10)

    assert len(samples) <= 10 * SAMPLE_RATE


def test_refuses_a_clip_past_the_limit() -> None:
    clip = encode_tone(61)

    with pytest.raises(ClipError) as refused:
        decode(clip)

    assert refused.value.code == 'clip_too_long'


@pytest.mark.parametrize(
    ('clip', 'code'),
    [
        (b'not audio at all, just invented bytes', 'clip_undecodable'),
        (b'', 'clip_empty'),
    ],
    ids=['garbage', 'empty'],
)
def test_refuses_bytes_that_hold_no_clip(clip: bytes, code: str) -> None:
    with pytest.raises(ClipError) as refused:
        decode(clip)

    assert refused.value.code == code


def test_refuses_a_video_with_no_audio_stream() -> None:
    clip = encode_video_only()

    with pytest.raises(ClipError) as refused:
        decode(clip)

    assert refused.value.code == 'clip_no_audio'
