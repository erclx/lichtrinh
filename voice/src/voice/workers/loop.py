"""The loop every worker runs: load once, then answer clips until stdin closes.
Every reply carries `ok`. The first reports the load, and each later one
answers one clip or one live step with its text or an error code."""

import logging
import os
import sys
import time
from collections.abc import Callable
from typing import BinaryIO, Protocol

import numpy as np

from voice.decode import Samples
from voice.models import Language
from voice.protocol import Frame, PipeClosedError, read_frame, write_frame


class Recognizer(Protocol):
    """One loaded model. Either call answers empty text when nobody speaks."""

    def transcribe(self, samples: Samples, language: Language) -> str: ...

    def live(
        self, samples: Samples, language: Language, state: object
    ) -> tuple[str, object]:
        """The text so far in a turn still being spoken, and the state the next
        step brings back, which is JSON and None on the first."""
        ...


log = logging.getLogger('voice.worker')

# A missing file, a CUDA failure, a bad config, or a missing library.
LOAD_ERRORS = (OSError, RuntimeError, ValueError, ImportError)


def serve(load: Callable[[], Recognizer]) -> int:
    logging.basicConfig(level=logging.INFO, format='%(name)s %(message)s')
    # `voice models` downloads every model ahead, so a worker never reaches the network.
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    channel = _claim_stdout()
    requests = sys.stdin.buffer
    started = time.perf_counter()
    try:
        recognizer = load()
    except LOAD_ERRORS:
        log.exception('load failed')
        write_frame(channel, Frame({'ok': False, 'error': 'load_failed'}))
        return 1
    write_frame(
        channel, Frame({'ok': True, 'load_seconds': time.perf_counter() - started})
    )
    while True:
        try:
            request = read_frame(requests)
        except PipeClosedError:
            return 0
        write_frame(channel, _answer(recognizer, request))


def _answer(recognizer: Recognizer, request: Frame) -> Frame:
    op = request.header.get('op')
    if op not in ('transcribe', 'live'):
        return Frame({'ok': False, 'error': 'unknown_op'})
    samples = np.frombuffer(request.payload, dtype='<f4')
    started = time.perf_counter()
    try:
        language = Language(str(request.header.get('language')))
        if op == 'live':
            text, state = recognizer.live(
                samples, language, request.header.get('state')
            )
            return Frame({'ok': True, 'text': text, 'state': state})
        text = recognizer.transcribe(samples, language)
    except (RuntimeError, ValueError) as error:
        # The type alone, since a message could quote what the model heard.
        log.error('%s failed: %s', op, type(error).__name__)
        return Frame({'ok': False, 'error': 'transcribe_failed'})
    seconds = time.perf_counter() - started
    return Frame({'ok': True, 'text': text, 'transcribe_seconds': seconds})


def _claim_stdout() -> BinaryIO:
    """Keeps stdout for frames and points fd 1 at stderr, so a library's print
    lands in the log rather than in the middle of a frame."""
    channel = os.fdopen(os.dup(1), 'wb')
    os.dup2(2, 1)
    return channel
