"""A worker on the real loop: fake_worker.py <model-id> <lock-path> [fail]. It holds
the lock as a model holds the card and answers '<model-id>:<sample count>', or
fails every clip under `fail`. A first sample of CRASH or STALL exits or stalls."""

import fcntl
import os
import sys
import time

from voice.decode import Samples
from voice.workers.loop import Transcriber, serve

CRASH = -1.0
STALL = -2.0


def load(model_id: str, lock_path: str, fail: bool) -> Transcriber:
    card = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    fcntl.flock(card, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def transcribe(samples: Samples) -> str:
        if samples[0] == CRASH:
            os._exit(3)
        if samples[0] == STALL:
            time.sleep(3600)
        if fail:
            raise RuntimeError('the model refused this clip')
        return f'{model_id}:{len(samples)}'

    return transcribe


if __name__ == '__main__':
    fail = sys.argv[3:] == ['fail']
    sys.exit(serve(lambda: load(sys.argv[1], sys.argv[2], fail)))
