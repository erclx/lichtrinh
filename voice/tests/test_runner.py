import asyncio
import fcntl
import os
import sys
from collections.abc import AsyncIterator, Callable, Sequence
from pathlib import Path

import numpy as np
import pytest
from fake_worker import CRASH, STALL

from voice.models import MODELS, Model
from voice.runner import Runner, WorkerUnavailableError

FAKE_WORKER = Path(__file__).parent / 'fake_worker.py'
QWEN, TURBO, PHO = MODELS


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def clip(count: int = 5, first: float = 0.0) -> np.ndarray:
    samples = np.zeros(count, dtype=np.float32)
    samples[0] = first
    return samples


@pytest.fixture
def card(tmp_path: Path) -> Path:
    return tmp_path / 'card.lock'


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
async def make_runner(card: Path, clock: Clock) -> AsyncIterator[Callable[..., Runner]]:
    runners: list[Runner] = []

    def fake_command(model: Model) -> Sequence[str]:
        return [sys.executable, str(FAKE_WORKER), model.id, str(card)]

    def make(
        command_for: Callable[[Model], Sequence[str]] = fake_command,
        timeout_seconds: float = 30.0,
    ) -> Runner:
        runner = Runner(
            command_for,
            idle_seconds=900,
            timeout_seconds=timeout_seconds,
            clock=clock,
        )
        runners.append(runner)
        return runner

    yield make
    for runner in runners:
        await runner.close()


def card_is_free(card: Path) -> bool:
    handle = os.open(card, os.O_CREAT | os.O_RDWR)
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return False
    finally:
        os.close(handle)
    return True


async def test_loads_the_model_on_the_first_clip(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner()

    transcript = await runner.transcribe(QWEN, clip(5))

    assert transcript.text == 'qwen3-asr-1.7b:5'
    assert transcript.load_seconds > 0
    assert runner.loaded == QWEN


async def test_reuses_the_loaded_worker_for_the_next_clip(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner()
    await runner.transcribe(QWEN, clip(5))

    transcript = await runner.transcribe(QWEN, clip(7))

    assert transcript.text == 'qwen3-asr-1.7b:7'
    assert transcript.load_seconds == 0


async def test_a_new_model_stops_the_old_worker_before_loading(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner()
    await runner.transcribe(QWEN, clip())

    # The fake refuses to load while another holds the card lock.
    transcript = await runner.transcribe(TURBO, clip(3))

    assert transcript.text == 'whisper-large-v3-turbo:3'
    assert runner.loaded == TURBO


async def test_clips_for_two_models_arriving_together_run_in_order(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner()

    first, second = await asyncio.gather(
        runner.transcribe(QWEN, clip(2)), runner.transcribe(PHO, clip(4))
    )

    assert (first.text, second.text) == ('qwen3-asr-1.7b:2', 'phowhisper-large:4')
    assert runner.loaded == PHO


async def test_warm_loads_without_a_clip(make_runner: Callable[..., Runner]) -> None:
    runner = make_runner()

    load_seconds = await runner.warm(TURBO)

    assert load_seconds > 0
    assert runner.loaded == TURBO


async def test_keeps_the_model_until_the_idle_timeout(
    make_runner: Callable[..., Runner], clock: Clock
) -> None:
    runner = make_runner()
    await runner.transcribe(QWEN, clip())
    clock.now += 899

    unloaded = await runner.unload_if_idle()

    assert not unloaded
    assert runner.loaded == QWEN


async def test_unloads_once_idle_and_frees_the_card(
    make_runner: Callable[..., Runner], clock: Clock, card: Path
) -> None:
    runner = make_runner()
    await runner.transcribe(QWEN, clip())
    clock.now += 900

    unloaded = await runner.unload_if_idle()

    assert unloaded
    assert runner.loaded is None
    assert card_is_free(card)


async def test_a_worker_dying_mid_clip_fails_that_clip(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner()
    await runner.transcribe(QWEN, clip())

    with pytest.raises(WorkerUnavailableError) as failed:
        await runner.transcribe(QWEN, clip(first=CRASH))

    assert failed.value.reason == 'worker_died'
    assert runner.loaded is None


async def test_the_clip_after_a_crash_starts_a_fresh_worker(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner()
    with pytest.raises(WorkerUnavailableError):
        await runner.transcribe(QWEN, clip(first=CRASH))

    transcript = await runner.transcribe(QWEN, clip(6))

    assert transcript.text == 'qwen3-asr-1.7b:6'
    assert transcript.load_seconds > 0


async def test_a_worker_that_never_answers_is_stopped(
    make_runner: Callable[..., Runner], card: Path
) -> None:
    runner = make_runner(timeout_seconds=1.0)
    await runner.warm(QWEN)

    with pytest.raises(WorkerUnavailableError) as failed:
        await runner.transcribe(QWEN, clip(first=STALL))

    assert failed.value.reason == 'worker_timeout'
    assert runner.loaded is None
    assert card_is_free(card)


async def test_a_worker_that_exits_before_ready_fails_the_load(
    make_runner: Callable[..., Runner],
) -> None:
    runner = make_runner(lambda model: [sys.executable, '-c', 'raise SystemExit(1)'])

    with pytest.raises(WorkerUnavailableError) as failed:
        await runner.transcribe(QWEN, clip())

    assert failed.value.reason == 'load_failed'
    assert runner.loaded is None


async def test_close_stops_the_worker_and_frees_the_card(
    make_runner: Callable[..., Runner], card: Path
) -> None:
    runner = make_runner()
    await runner.warm(QWEN)

    await runner.close()

    assert runner.loaded is None
    assert card_is_free(card)
