"""A worker speaking the real protocol, standing in for both model families.

Usage: fake_worker.py <model-id> <lock-path>. It holds an exclusive lock on the
lock path while alive, as a model holds the card, so a second one refuses to
load. It answers a clip with '<model-id>:<sample count>'. A clip whose first
sample is CRASH exits mid-clip, and one whose first sample is STALL never answers.
"""

import fcntl
import os
import sys
import time

from voice.decode import Samples
from voice.workers.loop import Transcriber, serve

CRASH = -1.0
STALL = -2.0


def load(model_id: str, lock_path: str) -> Transcriber:
    card = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    fcntl.flock(card, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def transcribe(samples: Samples) -> str:
        if samples[0] == CRASH:
            os._exit(3)
        if samples[0] == STALL:
            time.sleep(3600)
        return f'{model_id}:{len(samples)}'

    return transcribe


if __name__ == '__main__':
    sys.exit(serve(lambda: load(sys.argv[1], sys.argv[2])))
