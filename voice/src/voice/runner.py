"""Keeps at most one model worker alive and hands it one clip or live step at a
time. The card is shared with the local language model, so a new model stops the
old worker before its own starts, and an idle worker is stopped to free it."""

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum

from voice.decode import Samples
from voice.models import Language, Model
from voice.protocol import (
    Frame,
    PipeClosedError,
    ProtocolError,
    encode,
    read_frame_async,
)

log = logging.getLogger('voice.runner')

CommandFor = Callable[[Model], Sequence[str]]


class Failure(StrEnum):
    LOAD_FAILED = 'load_failed'
    WORKER_DIED = 'worker_died'
    WORKER_TIMEOUT = 'worker_timeout'
    TRANSCRIBE_FAILED = 'transcribe_failed'


class WorkerUnavailableError(RuntimeError):
    def __init__(self, reason: Failure) -> None:
        super().__init__(reason.value)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class Transcript:
    text: str
    # Zero when the model was already loaded.
    load_seconds: float
    transcribe_seconds: float


@dataclass(frozen=True, slots=True)
class LiveStep:
    text: str
    # What the worker's next step on this turn needs back.
    state: object


@dataclass(frozen=True, slots=True)
class _Worker:
    model: Model
    process: asyncio.subprocess.Process


class Runner:
    def __init__(
        self,
        command_for: CommandFor,
        *,
        idle_seconds: float,
        timeout_seconds: float = 120.0,
        live_seconds: float = 10.0,
        stop_seconds: float = 10.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._command_for = command_for
        self._idle_seconds = idle_seconds
        self._timeout_seconds = timeout_seconds
        self._live_seconds = live_seconds
        self._stop_seconds = stop_seconds
        self._clock = clock
        self._lock = asyncio.Lock()
        # Callers holding or awaiting the lock, which reads free between two.
        self._claims = 0
        self._loading: asyncio.Task[None] | None = None
        self._worker: _Worker | None = None
        self._last_used = clock()

    @property
    def loaded(self) -> Model | None:
        worker = self._worker
        if worker is None or worker.process.returncode is not None:
            return None
        return worker.model

    async def warm(self, model: Model) -> float:
        """Loads `model` and returns the seconds it took, zero if it was loaded.
        Either way the idle clock restarts, since a warm means a clip is coming."""
        async with self._claim():
            seconds = await self._ensure(model)
            self._last_used = self._clock()
            return seconds

    async def transcribe(
        self, model: Model, samples: Samples, language: Language
    ) -> Transcript:
        async with self._claim():
            load_seconds = await self._ensure(model)
            worker = self._worker
            assert worker is not None
            request = Frame(
                {'op': 'transcribe', 'language': language.value},
                samples.astype('<f4').tobytes(),
            )
            reply = await self._exchange(worker, request, self._timeout_seconds)
            self._last_used = self._clock()
        if reply.header.get('ok') is not True:
            raise WorkerUnavailableError(Failure.TRANSCRIBE_FAILED)
        return Transcript(
            text=str(reply.header.get('text', '')),
            load_seconds=load_seconds,
            transcribe_seconds=_seconds(reply.header.get('transcribe_seconds')),
        )

    async def live(
        self, model: Model, samples: Samples, language: Language, state: object
    ) -> LiveStep | None:
        """One step of a turn still being spoken, or None when the worker is
        busy, since a preview never waits. A model not loaded starts loading, so
        the words come back on a later step."""
        loading = self._loading is not None and not self._loading.done()
        if self._claims > 0 or loading:
            return None
        if self.loaded != model:
            self._loading = asyncio.create_task(self._load(model))
            return None
        async with self._claim():
            worker = self._worker
            assert worker is not None
            request = Frame(
                {'op': 'live', 'language': language.value, 'state': state},
                samples.astype('<f4').tobytes(),
            )
            reply = await self._exchange(worker, request, self._live_seconds)
            self._last_used = self._clock()
        if reply.header.get('ok') is not True:
            raise WorkerUnavailableError(Failure.TRANSCRIBE_FAILED)
        return LiveStep(
            text=str(reply.header.get('text', '')), state=reply.header.get('state')
        )

    async def unload_if_idle(self) -> bool:
        """Stops the worker once it has sat unused for the idle timeout."""
        if self._worker is None or self._claims > 0:
            return False
        if self._clock() - self._last_used < self._idle_seconds:
            return False
        async with self._claim():
            if self._worker is None:
                return False
            log.info('unload model=%s outcome=idle', self._worker.model.id)
            await self._stop()
            return True

    async def close(self) -> None:
        if self._loading is not None:
            self._loading.cancel()
        async with self._claim():
            await self._stop()

    @contextlib.asynccontextmanager
    async def _claim(self) -> AsyncIterator[None]:
        self._claims += 1
        try:
            async with self._lock:
                yield
        finally:
            self._claims -= 1

    async def _load(self, model: Model) -> None:
        # The next step asks again, so a failed load needs no answer here.
        with contextlib.suppress(WorkerUnavailableError):
            await self.warm(model)

    async def _ensure(self, model: Model) -> float:
        if self.loaded == model:
            return 0.0
        await self._stop()
        started = time.perf_counter()
        process = await asyncio.create_subprocess_exec(
            *self._command_for(model),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
        )
        worker = _Worker(model, process)
        self._worker = worker
        try:
            ready = await self._read(worker, self._timeout_seconds)
        except WorkerUnavailableError:
            raise WorkerUnavailableError(Failure.LOAD_FAILED) from None
        if ready.header.get('ok') is not True:
            await self._stop()
            raise WorkerUnavailableError(Failure.LOAD_FAILED)
        seconds = time.perf_counter() - started
        self._last_used = self._clock()
        log.info('load model=%s seconds=%.2f outcome=ok', model.id, seconds)
        return seconds

    async def _exchange(
        self, worker: _Worker, request: Frame, timeout_seconds: float
    ) -> Frame:
        stdin = worker.process.stdin
        assert stdin is not None
        try:
            stdin.write(encode(request))
            await stdin.drain()
        except BrokenPipeError, ConnectionResetError:
            await self._stop(kill=True)
            raise WorkerUnavailableError(Failure.WORKER_DIED) from None
        return await self._read(worker, timeout_seconds)

    async def _read(self, worker: _Worker, timeout_seconds: float) -> Frame:
        """Reads one reply, stopping the worker when it dies or stalls."""
        stdout = worker.process.stdout
        assert stdout is not None
        try:
            async with asyncio.timeout(timeout_seconds):
                return await read_frame_async(stdout)
        except TimeoutError:
            failure = Failure.WORKER_TIMEOUT
        except PipeClosedError, ProtocolError:
            failure = Failure.WORKER_DIED
        log.warning('worker model=%s outcome=%s', worker.model.id, failure.value)
        await self._stop(kill=True)
        raise WorkerUnavailableError(failure)

    async def _stop(self, *, kill: bool = False) -> None:
        """Closes the worker's stdin, which ends its loop, and kills it if it
        lingers. A worker that stalled or broke its pipe is killed at once."""
        worker, self._worker = self._worker, None
        if worker is None:
            return
        process = worker.process
        if kill and process.returncode is None:
            process.kill()
        if process.stdin is not None and not process.stdin.is_closing():
            process.stdin.close()
        try:
            async with asyncio.timeout(self._stop_seconds):
                await process.wait()
        except TimeoutError:
            process.kill()
            await process.wait()


def _seconds(value: object) -> float:
    return float(value) if isinstance(value, int | float) else 0.0
