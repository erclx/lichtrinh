"""Invented clips built in memory, so no recording ever enters the repository."""

import io
from fractions import Fraction

import av
import numpy as np

TONE_RATE = 48_000


def encode_tone(
    seconds: float, container: str = 'webm', codec: str = 'libopus'
) -> bytes:
    """A 440 Hz stereo tone, so decoding has to downmix and resample it."""
    t = np.arange(int(seconds * TONE_RATE)) / TONE_RATE
    tone = (0.3 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)
    stereo = np.stack([tone, tone]).reshape(1, -1, order='F')
    buffer = io.BytesIO()
    with av.open(buffer, 'w', format=container) as output:
        stream = output.add_stream(codec, rate=TONE_RATE, layout='stereo')
        frame = av.AudioFrame.from_ndarray(stereo, format='s16', layout='stereo')
        frame.sample_rate = TONE_RATE
        resampler = av.AudioResampler(
            format=stream.format.name, layout='stereo', rate=TONE_RATE
        )
        for chunk in [*resampler.resample(frame), *resampler.resample(None)]:
            output.mux(stream.encode(chunk))
        output.mux(stream.encode(None))
    return buffer.getvalue()


def encode_video_only() -> bytes:
    """A few grey frames with no audio stream at all."""
    buffer = io.BytesIO()
    with av.open(buffer, 'w', format='mp4') as output:
        stream = output.add_stream('mpeg4', rate=10)
        stream.width, stream.height = 64, 64
        stream.pix_fmt = 'yuv420p'
        stream.time_base = Fraction(1, 10)
        for index in range(5):
            image = np.full((64, 64, 3), 128, dtype=np.uint8)
            frame = av.VideoFrame.from_ndarray(image, format='rgb24')
            frame.pts = index
            output.mux(stream.encode(frame))
        output.mux(stream.encode(None))
    return buffer.getvalue()
