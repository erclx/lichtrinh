"""Turns a recorded clip into the samples every model reads, in memory alone."""

import io
from collections.abc import Iterator
from enum import StrEnum

import av
import numpy as np
import numpy.typing as npt

SAMPLE_RATE = 16_000
MAX_SECONDS = 60.0

Samples = npt.NDArray[np.float32]


class Refusal(StrEnum):
    EMPTY = 'clip_empty'
    UNDECODABLE = 'clip_undecodable'
    NO_AUDIO = 'clip_no_audio'
    TOO_LONG = 'clip_too_long'


class ClipError(ValueError):
    """A clip the server refuses, carrying a code a caller can branch on."""

    def __init__(self, code: Refusal) -> None:
        super().__init__(code.value)
        self.code = code


def decode(data: bytes, max_seconds: float = MAX_SECONDS) -> Samples:
    """Decodes webm, mp4, or any container FFmpeg reads to 16 kHz mono float32,
    stopping as soon as the clip passes `max_seconds`."""
    if not data:
        raise ClipError(Refusal.EMPTY)
    limit = int(max_seconds * SAMPLE_RATE)
    chunks: list[Samples] = []
    count = 0
    try:
        with av.open(io.BytesIO(data), mode='r') as container:
            if not container.streams.audio:
                raise ClipError(Refusal.NO_AUDIO)
            resampler = av.AudioResampler(format='flt', layout='mono', rate=SAMPLE_RATE)
            for frame in _resampled(resampler, container.decode(audio=0)):
                chunk = frame.to_ndarray().reshape(-1).astype(np.float32, copy=False)
                count += len(chunk)
                if count > limit:
                    raise ClipError(Refusal.TOO_LONG)
                chunks.append(chunk)
    except av.FFmpegError as error:
        raise ClipError(Refusal.UNDECODABLE) from error
    if count == 0:
        raise ClipError(Refusal.EMPTY)
    return np.concatenate(chunks)


def _resampled(
    resampler: av.AudioResampler, frames: Iterator[av.AudioFrame]
) -> Iterator[av.AudioFrame]:
    for frame in frames:
        yield from resampler.resample(frame)
    # A None flushes what the resampler still buffers from the last frame.
    yield from resampler.resample(None)
