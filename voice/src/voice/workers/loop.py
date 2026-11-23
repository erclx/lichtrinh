"""The loop every worker runs: load once, then answer clips until stdin closes.

A worker replies with `ok` on every frame. The first frame reports the load,
and each later one answers one clip with its text or an error code.
"""

import logging
import os
import sys
import time
from collections.abc import Callable
from typing import BinaryIO

import numpy as np

from voice.decode import Samples
from voice.protocol import Frame, PipeClosedError, read_frame, write_frame

Transcriber = Callable[[Samples], str]

log = logging.getLogger('voice.worker')

# What loading weights onto a card raises: a missing file, a CUDA failure, a
# bad config, or a library the environment lacks.
LOAD_ERRORS = (OSError, RuntimeError, ValueError, ImportError)


def serve(load: Callable[[], Transcriber]) -> int:
    """Runs one worker to its end and returns the process exit code."""
    logging.basicConfig(level=logging.INFO, format='%(name)s %(message)s')
    channel = _claim_stdout()
    requests = sys.stdin.buffer
    started = time.perf_counter()
    try:
        transcribe = load()
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
        write_frame(channel, _answer(transcribe, request))


def _answer(transcribe: Transcriber, request: Frame) -> Frame:
    if request.header.get('op') != 'transcribe':
        return Frame({'ok': False, 'error': 'unknown_op'})
    samples = np.frombuffer(request.payload, dtype='<f4')
    started = time.perf_counter()
    try:
        text = transcribe(samples)
    except (RuntimeError, ValueError) as error:
        # The type alone, since a message could quote what the model heard.
        log.error('transcribe failed: %s', type(error).__name__)
        return Frame({'ok': False, 'error': 'transcribe_failed'})
    seconds = time.perf_counter() - started
    return Frame({'ok': True, 'text': text, 'transcribe_seconds': seconds})


def _claim_stdout() -> BinaryIO:
    """Keeps stdout for frames and points fd 1 at stderr, so a library's print
    lands in the log rather than in the middle of a frame."""
    channel = os.fdopen(os.dup(1), 'wb')
    os.dup2(2, 1)
    return channel
