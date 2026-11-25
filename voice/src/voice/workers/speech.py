"""The silence check both model families run ahead of a model, since each of them
writes words for a room with nobody speaking in it."""

import numpy as np

from voice.decode import SAMPLE_RATE, Samples
from voice.workers.steps import Span, Spans


def load_speech() -> Spans:
    """Loads Silero, which runs on the CPU, and reads each stretch of speech."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    options = VadOptions(min_silence_duration_ms=500, speech_pad_ms=100)

    def spans(samples: Samples) -> list[Span]:
        found = get_speech_timestamps(samples, options)
        return [Span(int(one['start']), int(one['end'])) for one in found]

    # The first read builds the session, so it happens here and not mid-turn.
    spans(np.zeros(SAMPLE_RATE, dtype=np.float32))
    return spans
