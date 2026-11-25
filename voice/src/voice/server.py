"""The HTTP front the bridge calls, in the OpenAI transcription shape beside a
live route of its own. Every failure answers `{"error": {"code", "message"}}`,
branched on by code alone, and no clip or text reaches a log line or an error."""

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator
from typing import Literal

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.exceptions import HTTPException

from voice.config import HOST, Settings
from voice.decode import MAX_SECONDS, SAMPLE_RATE, ClipError, decode
from voice.form import FormError, parse_form
from voice.live import UNTOUCHED_SECONDS, LiveTurns
from voice.models import (
    DEFAULT_LANGUAGE,
    DEFAULT_MODEL,
    MODELS,
    Language,
    Model,
    find_model,
)
from voice.runner import Failure, Runner, WorkerUnavailableError
from voice.workers import worker_command

log = logging.getLogger('voice.server')

# A 60 second clip runs well under 2 MB in webm/opus or mp4/aac.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_WARM_BYTES = 4 * 1024


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message


class Timings(BaseModel):
    decode_seconds: float
    load_seconds: float
    transcribe_seconds: float


class TranscriptionResponse(BaseModel):
    text: str
    model: str
    duration_seconds: float
    timings: Timings


class WarmRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    model: str = DEFAULT_MODEL.id


class WarmResponse(BaseModel):
    model: str
    load_seconds: float


class LiveQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')

    start: int = Field(alias='from', ge=0)
    model: str | None = None
    language: str | None = None


class LiveResponse(BaseModel):
    text: str
    # The bytes held, where the next piece starts.
    heard: int


class HealthResponse(BaseModel):
    status: Literal['ok']
    loaded_model: str | None
    default_model: str
    models: list[str]


CLIP_MESSAGES = {
    'clip_empty': 'The clip holds no audio.',
    'clip_undecodable': 'The clip is not audio the server can read.',
    'clip_no_audio': 'The file holds no audio stream.',
    'clip_too_long': f'The clip runs past {MAX_SECONDS:.0f} seconds.',
}


def create_app(
    runner: Runner,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    check_seconds: float = 30.0,
) -> FastAPI:
    turns = LiveTurns()

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        watches = (
            asyncio.create_task(_unload_when_idle(runner, check_seconds)),
            asyncio.create_task(_drop_untouched(turns)),
        )
        try:
            yield
        finally:
            for watch in watches:
                watch.cancel()
            await runner.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def api_error(_: Request, error: ApiError) -> JSONResponse:
        return _error(error.status, error.code, error.message)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, error: HTTPException) -> JSONResponse:
        code = 'not_found' if error.status_code == 404 else 'http_error'
        return _error(error.status_code, code, str(error.detail))

    @app.post('/v1/audio/transcriptions')
    async def transcriptions(request: Request) -> TranscriptionResponse:
        body = await _read_body(request, max_bytes)
        try:
            form = parse_form(body, request.headers.get('content-type', ''))
        except FormError as error:
            raise _invalid('Send the clip as multipart/form-data.') from error
        if 'file' not in form:
            raise _invalid('The form has no file field.')
        model = _model(_text(form, 'model'))
        language = _language(model, _text(form, 'language'))
        clip = form['file']

        started = time.perf_counter()
        try:
            samples = await asyncio.to_thread(decode, clip)
        except ClipError as error:
            log.info('transcribe bytes=%d outcome=%s', len(clip), error.code)
            raise ApiError(422, error.code, CLIP_MESSAGES[error.code]) from None
        decode_seconds = time.perf_counter() - started
        duration = len(samples) / SAMPLE_RATE

        try:
            transcript = await runner.transcribe(model, samples, language)
        except WorkerUnavailableError as error:
            log.warning(
                'transcribe model=%s duration=%.2fs outcome=%s',
                model.id,
                duration,
                error.reason,
            )
            # A clip the model fails leaves voice up, so the caller keeps it apart.
            if error.reason is Failure.TRANSCRIBE_FAILED:
                message = f'The model {model.id} could not transcribe this clip.'
                raise ApiError(502, 'transcribe_failed', message) from None
            raise _unavailable(model) from None
        log.info(
            'transcribe model=%s bytes=%d duration=%.2fs decode=%.2fs load=%.2fs '
            'transcribe=%.2fs outcome=ok',
            model.id,
            len(clip),
            duration,
            decode_seconds,
            transcript.load_seconds,
            transcript.transcribe_seconds,
        )
        return TranscriptionResponse(
            text=transcript.text,
            model=model.id,
            duration_seconds=duration,
            timings=Timings(
                decode_seconds=decode_seconds,
                load_seconds=transcript.load_seconds,
                transcribe_seconds=transcript.transcribe_seconds,
            ),
        )

    @app.put('/v1/live/{turn_id}')
    async def live(turn_id: str, request: Request) -> LiveResponse:
        try:
            query = LiveQuery.model_validate(dict(request.query_params))
        except ValidationError as error:
            raise _invalid('Name the byte the piece starts at in `from`.') from error
        model = _model(query.model)
        language = _language(model, query.language)
        if query.start > max_bytes:
            raise _too_large(max_bytes)
        piece = await _read_body(request, max_bytes - query.start)

        turn, grew = turns.hear(turn_id, query.start, piece)
        if turn is None:
            return LiveResponse(text='', heard=0)
        heard = len(turn.audio)
        if not grew:
            return LiveResponse(text=turn.text, heard=heard)
        turn.speak(model, language)
        try:
            samples = await asyncio.to_thread(decode, bytes(turn.audio))
            step = await runner.live(model, samples, language, turn.state)
        except ClipError:
            # A piece can end inside a container's fragment, so the next one reads.
            step = None
        except WorkerUnavailableError as error:
            log.warning('live model=%s outcome=%s', model.id, error.reason)
            if error.reason is Failure.TRANSCRIBE_FAILED:
                message = f'The model {model.id} could not read this turn.'
                raise ApiError(502, 'transcribe_failed', message) from None
            raise _unavailable(model) from None
        if step is not None:
            turn.write(model, language, step.text, step.state)
        return LiveResponse(text=turn.text, heard=heard)

    @app.post('/v1/warm')
    async def warm(request: Request) -> WarmResponse:
        body = await _read_body(request, MAX_WARM_BYTES)
        try:
            asked = WarmRequest.model_validate_json(body) if body else WarmRequest()
        except ValidationError as error:
            raise _invalid('The body must be {"model": "<model id>"}.') from error
        model = _model(asked.model)
        try:
            seconds = await runner.warm(model)
        except WorkerUnavailableError as error:
            log.warning('warm model=%s outcome=%s', model.id, error.reason)
            raise _unavailable(model) from None
        return WarmResponse(model=model.id, load_seconds=seconds)

    @app.get('/health')
    async def health() -> HealthResponse:
        loaded = runner.loaded
        return HealthResponse(
            status='ok',
            loaded_model=loaded.id if loaded else None,
            default_model=DEFAULT_MODEL.id,
            models=[model.id for model in MODELS],
        )

    return app


def serve(settings: Settings) -> None:
    """Runs the server in the foreground until it is stopped."""
    runner = Runner(
        lambda model: worker_command(model, settings.models_dir),
        idle_seconds=settings.idle_seconds,
    )
    app = create_app(runner, check_seconds=min(30.0, settings.idle_seconds))
    config = uvicorn.Config(app, host=HOST, port=settings.port, log_level='info')
    # Config sets up uvicorn's loggers, so the filter goes on after it.
    logging.getLogger('uvicorn.access').addFilter(strip_query)
    logging.basicConfig(
        level=logging.INFO, format='%(levelname)s: %(name)s %(message)s'
    )
    uvicorn.Server(config).run()


def strip_query(record: logging.LogRecord) -> bool:
    """Drops the query string from an access log line, keeping the path, and drops
    a live request whole, since it names an account twice a second."""
    args = record.args
    if isinstance(args, tuple) and len(args) == 5 and isinstance(args[2], str):
        path = args[2].split('?', 1)[0]
        record.args = (*args[:2], path, *args[3:])
        return not path.startswith('/v1/live/')
    return True


async def _unload_when_idle(runner: Runner, check_seconds: float) -> None:
    while True:
        await asyncio.sleep(check_seconds)
        await runner.unload_if_idle()


async def _drop_untouched(turns: LiveTurns) -> None:
    while True:
        await asyncio.sleep(UNTOUCHED_SECONDS)
        turns.drop_untouched()


async def _read_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get('content-length', '')
    if declared.isdigit() and int(declared) > limit:
        raise _too_large(limit)
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise _too_large(limit)
        chunks.append(chunk)
    return b''.join(chunks)


def _model(model_id: str | None) -> Model:
    if model_id is None or model_id == '':
        return DEFAULT_MODEL
    model = find_model(model_id)
    if model is None:
        names = ', '.join(model.id for model in MODELS)
        raise ApiError(400, 'unknown_model', f'Pick one of: {names}.')
    return model


def _language(model: Model, code: str | None) -> Language:
    spoken = DEFAULT_LANGUAGE if code is None or code == '' else code
    if spoken not in model.languages:
        codes = ', '.join(sorted(model.languages))
        raise ApiError(400, 'unknown_language', f'{model.id} hears: {codes}.')
    return Language(spoken)


def _text(form: dict[str, bytes], name: str) -> str | None:
    return form[name].decode('utf-8', 'replace') if name in form else None


def _invalid(message: str) -> ApiError:
    return ApiError(422, 'invalid_request', message)


def _too_large(limit: int) -> ApiError:
    return ApiError(413, 'clip_too_large', f'The upload runs past {limit} bytes.')


def _unavailable(model: Model) -> ApiError:
    return ApiError(
        503, 'worker_unavailable', f'The model {model.id} is not answering.'
    )


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        {'error': {'code': code, 'message': message}}, status_code=status
    )
