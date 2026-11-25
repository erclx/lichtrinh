"""A worker on the real loop: fake_worker.py <model-id> <lock-path> [fail]. It holds
the lock as a model holds the card and answers '<model-id>:<sample count>', with
the language named when it is not Vietnamese, or fails every clip under `fail`.
A live step counts in its state. A first sample of CRASH or STALL exits or stalls."""

import fcntl
import os
import sys
import time

from voice.decode import Samples
from voice.models import Language
from voice.workers.loop import serve

CRASH = -1.0
STALL = -2.0


class FakeRecognizer:
    def __init__(self, model_id: str, fail: bool) -> None:
        self.model_id = model_id
        self.fail = fail

    def transcribe(self, samples: Samples, language: Language) -> str:
        if samples[0] == CRASH:
            os._exit(3)
        if samples[0] == STALL:
            time.sleep(3600)
        if self.fail:
            raise RuntimeError('the model refused this clip')
        spoken = '' if language is Language.VIETNAMESE else f'{language}:'
        return f'{self.model_id}:{spoken}{len(samples)}'

    def live(
        self, samples: Samples, language: Language, state: object
    ) -> tuple[str, object]:
        step = (state if isinstance(state, int) else 0) + 1
        return f'step{step}:{self.transcribe(samples, language)}', step


def load(model_id: str, lock_path: str, fail: bool) -> FakeRecognizer:
    card = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    fcntl.flock(card, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return FakeRecognizer(model_id, fail)


if __name__ == '__main__':
    fail = sys.argv[3:] == ['fail']
    sys.exit(serve(lambda: load(sys.argv[1], sys.argv[2], fail)))
