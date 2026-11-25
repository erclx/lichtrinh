import logging
import sys
from collections.abc import Callable, Iterator, Sequence
from pathlib import Path

import pytest
from clips import encode_tone
from fastapi.testclient import TestClient

from voice.models import Model
from voice.runner import Runner
from voice.server import create_app, strip_query

FAKE_WORKER = Path(__file__).parent / 'fake_worker.py'
MODEL_IDS = ['qwen3-asr-1.7b', 'whisper-large-v3-turbo', 'phowhisper-large']

MakeClient = Callable[..., TestClient]


@pytest.fixture
def make_client(tmp_path: Path) -> Iterator[MakeClient]:
    clients: list[TestClient] = []

    def fake_command(model: Model) -> Sequence[str]:
        return [sys.executable, str(FAKE_WORKER), model.id, str(tmp_path / 'card')]

    def make(
        command_for: Callable[[Model], Sequence[str]] = fake_command,
        max_bytes: int = 4 * 1024 * 1024,
    ) -> TestClient:
        runner = Runner(command_for, idle_seconds=900, timeout_seconds=30)
        client = TestClient(create_app(runner, max_bytes=max_bytes))
        client.__enter__()
        clients.append(client)
        return client

    yield make
    for client in clients:
        client.__exit__(None, None, None)


def post_clip(
    client: TestClient,
    clip: bytes,
    model: str | None = None,
    language: str | None = None,
) -> dict[str, object]:
    fields = {'model': model, 'language': language}
    data = {name: value for name, value in fields.items() if value is not None}
    response = client.post(
        '/v1/audio/transcriptions',
        files={'file': ('clip.webm', clip, 'audio/webm')},
        data=data,
    )
    return {'status': response.status_code, **response.json()}


def sample_count(text: object) -> int:
    assert isinstance(text, str)
    return int(text.rsplit(':', 1)[1])


class TestTranscriptions:
    def test_answers_a_clip_with_its_text_and_timings(
        self, make_client: MakeClient
    ) -> None:
        client = make_client()

        body = post_clip(client, encode_tone(1.0), 'whisper-large-v3-turbo')

        assert body['status'] == 200
        assert body['model'] == 'whisper-large-v3-turbo'
        assert str(body['text']).startswith('whisper-large-v3-turbo:')
        # The fake echoes the sample count, so this proves 16 kHz reached it.
        assert abs(sample_count(body['text']) - 16_000) < 800
        assert body['duration_seconds'] == pytest.approx(1.0, abs=0.05)
        timings = body['timings']
        assert isinstance(timings, dict)
        assert set(timings) == {'decode_seconds', 'load_seconds', 'transcribe_seconds'}

    def test_uses_the_default_model_when_none_is_named(
        self, make_client: MakeClient
    ) -> None:
        client = make_client()

        body = post_clip(client, encode_tone(0.5))

        assert body['model'] == 'qwen3-asr-1.7b'

    def test_refuses_an_unknown_model(self, make_client: MakeClient) -> None:
        client = make_client()

        body = post_clip(client, encode_tone(0.5), 'whisper-1')

        assert body['status'] == 400
        assert error_code(body) == 'unknown_model'

    def test_hears_a_clip_in_the_language_named(self, make_client: MakeClient) -> None:
        client = make_client()

        body = post_clip(client, encode_tone(0.5), language='en')

        assert str(body['text']).startswith('qwen3-asr-1.7b:en:')

    @pytest.mark.parametrize(
        ('model', 'language'),
        [('qwen3-asr-1.7b', 'fr'), ('phowhisper-large', 'en')],
        ids=['no-model-hears-it', 'this-model-does-not'],
    )
    def test_refuses_a_language_the_model_does_not_hear(
        self, make_client: MakeClient, model: str, language: str
    ) -> None:
        client = make_client()

        body = post_clip(client, encode_tone(0.5), model, language)

        assert body['status'] == 400
        assert error_code(body) == 'unknown_language'

    @pytest.mark.parametrize(
        ('clip', 'code'),
        [
            (b'', 'clip_empty'),
            (b'invented bytes that are not audio', 'clip_undecodable'),
            (encode_tone(61), 'clip_too_long'),
        ],
        ids=['empty', 'garbage', 'overlong'],
    )
    def test_refuses_a_clip_it_cannot_use(
        self, make_client: MakeClient, clip: bytes, code: str
    ) -> None:
        client = make_client()

        body = post_clip(client, clip)

        assert body['status'] == 422
        assert error_code(body) == code

    def test_refuses_an_upload_past_the_byte_limit(
        self, make_client: MakeClient
    ) -> None:
        client = make_client(max_bytes=10_000)

        body = post_clip(client, b'\x00' * 20_000)

        assert body['status'] == 413
        assert error_code(body) == 'clip_too_large'

    def test_refuses_a_form_with_no_file(self, make_client: MakeClient) -> None:
        client = make_client()

        response = client.post(
            '/v1/audio/transcriptions', files={'model': (None, 'qwen3-asr-1.7b')}
        )

        assert response.status_code == 422
        assert error_code(response.json()) == 'invalid_request'

    def test_refuses_a_body_that_is_not_a_form(self, make_client: MakeClient) -> None:
        client = make_client()

        response = client.post('/v1/audio/transcriptions', content=b'{}')

        assert response.status_code == 422
        assert error_code(response.json()) == 'invalid_request'

    def test_answers_503_when_the_model_cannot_load(
        self, make_client: MakeClient
    ) -> None:
        client = make_client(
            lambda model: [sys.executable, '-c', 'raise SystemExit(1)']
        )

        body = post_clip(client, encode_tone(0.5))

        assert body['status'] == 503
        assert error_code(body) == 'worker_unavailable'

    def test_answers_502_when_the_model_fails_the_clip(
        self, make_client: MakeClient, tmp_path: Path
    ) -> None:
        card = str(tmp_path / 'card')
        client = make_client(
            lambda model: [sys.executable, str(FAKE_WORKER), model.id, card, 'fail']
        )

        body = post_clip(client, encode_tone(0.5))

        assert body['status'] == 502
        assert error_code(body) == 'transcribe_failed'
        assert client.get('/health').json()['loaded_model'] == 'qwen3-asr-1.7b'

    def test_logs_the_outcome_without_the_text(
        self, make_client: MakeClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        client = make_client()
        caplog.set_level(logging.INFO, logger='voice')

        body = post_clip(client, encode_tone(0.5))

        assert 'outcome=ok' in caplog.text
        assert str(body['text']) not in caplog.text


def put_piece(
    client: TestClient,
    piece: bytes,
    start: int = 0,
    turn: str = 'invented-user.turn-1',
    **query: str,
) -> dict[str, object]:
    response = client.put(
        f'/v1/live/{turn}',
        params={'from': str(start), **query},
        content=piece,
        headers={'content-type': 'audio/webm'},
    )
    return {'status': response.status_code, **response.json()}


class TestLive:
    @pytest.fixture
    def client(self, make_client: MakeClient) -> TestClient:
        client = make_client()
        client.post('/v1/warm')
        return client

    def test_answers_the_words_so_far_and_the_bytes_held(
        self, client: TestClient
    ) -> None:
        piece = encode_tone(1.0)

        body = put_piece(client, piece)

        assert body['status'] == 200
        assert body['heard'] == len(piece)
        assert str(body['text']).startswith('step1:qwen3-asr-1.7b:')
        assert abs(sample_count(body['text']) - 16_000) < 800

    def test_a_later_piece_grows_the_turn_and_steps_it_again(
        self, client: TestClient
    ) -> None:
        clip = encode_tone(2.0)
        half = len(clip) // 2
        first = put_piece(client, clip[:half])

        second = put_piece(client, clip[half:], half)

        assert str(second['text']).startswith('step2:')
        assert sample_count(second['text']) > sample_count(first['text'])
        assert second['heard'] == len(clip)

    def test_a_repeated_piece_answers_the_same_text_and_no_new_step(
        self, client: TestClient
    ) -> None:
        piece = encode_tone(1.0)
        first = put_piece(client, piece)

        second = put_piece(client, piece)

        assert second == first

    def test_an_unknown_turn_is_asked_for_from_its_start(
        self, client: TestClient
    ) -> None:
        body = put_piece(client, b'later bytes', 4096)

        assert (body['status'], body['text'], body['heard']) == (200, '', 0)

    def test_a_prefix_it_cannot_read_yet_keeps_the_last_text(
        self, client: TestClient
    ) -> None:
        clip = encode_tone(1.0, 'mp4', 'aac')
        half = len(clip) // 2

        body = put_piece(client, clip[:half])

        assert (body['status'], body['text'], body['heard']) == (200, '', half)

    def test_hears_the_turn_in_the_model_and_language_named(
        self, make_client: MakeClient
    ) -> None:
        client = make_client()
        client.post('/v1/warm', json={'model': 'whisper-large-v3-turbo'})

        body = put_piece(
            client, encode_tone(0.5), model='whisper-large-v3-turbo', language='en'
        )

        assert str(body['text']).startswith('step1:whisper-large-v3-turbo:en:')

    def test_a_model_still_loading_costs_the_words_alone(
        self, make_client: MakeClient
    ) -> None:
        client = make_client()
        piece = encode_tone(0.5)

        body = put_piece(client, piece)

        assert (body['status'], body['text'], body['heard']) == (200, '', len(piece))

    @pytest.mark.parametrize(
        ('query', 'status', 'code'),
        [
            ({'model': 'whisper-1'}, 400, 'unknown_model'),
            ({'language': 'fr'}, 400, 'unknown_language'),
            ({'model': 'phowhisper-large', 'language': 'en'}, 400, 'unknown_language'),
            ({'from': '-1'}, 422, 'invalid_request'),
            ({'form': '0'}, 422, 'invalid_request'),
        ],
        ids=['model', 'language', 'unheard-language', 'negative-start', 'unknown'],
    )
    def test_refuses_a_bad_request(
        self, client: TestClient, query: dict[str, str], status: int, code: str
    ) -> None:
        response = client.put(
            '/v1/live/invented-user.turn-1',
            params={'from': '0', **query},
            content=b'piece',
        )

        assert response.status_code == status
        assert error_code(response.json()) == code

    def test_refuses_a_turn_past_the_byte_limit(self, make_client: MakeClient) -> None:
        client = make_client(max_bytes=10_000)
        put_piece(client, b'\x00' * 6_000)

        body = put_piece(client, b'\x00' * 6_000, 6_000)

        assert body['status'] == 413
        assert error_code(body) == 'clip_too_large'

    def test_answers_503_when_the_step_kills_the_worker(
        self, make_client: MakeClient, tmp_path: Path
    ) -> None:
        card = str(tmp_path / 'card')
        client = make_client(
            lambda model: [sys.executable, str(FAKE_WORKER), model.id, card, 'die']
        )
        client.post('/v1/warm')

        body = put_piece(client, encode_tone(0.5))

        assert body['status'] == 503
        assert error_code(body) == 'worker_unavailable'

    def test_logs_neither_the_text_nor_the_turn_it_belongs_to(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        caplog.set_level(logging.INFO, logger='voice')

        body = put_piece(client, encode_tone(0.5))

        assert str(body['text']) not in caplog.text
        assert 'invented-user' not in caplog.text


class TestWarm:
    def test_loads_the_named_model(self, make_client: MakeClient) -> None:
        client = make_client()

        response = client.post('/v1/warm', json={'model': 'phowhisper-large'})

        assert response.status_code == 200
        assert response.json()['model'] == 'phowhisper-large'
        assert response.json()['load_seconds'] > 0
        assert client.get('/health').json()['loaded_model'] == 'phowhisper-large'

    def test_loads_the_default_model_with_no_body(
        self, make_client: MakeClient
    ) -> None:
        client = make_client()

        response = client.post('/v1/warm')

        assert response.json()['model'] == 'qwen3-asr-1.7b'

    @pytest.mark.parametrize(
        ('body', 'status', 'code'),
        [
            (b'{"model": "whisper-1"}', 400, 'unknown_model'),
            (b'{"model": 3}', 422, 'invalid_request'),
            (b'{"modle": "qwen3-asr-1.7b"}', 422, 'invalid_request'),
        ],
        ids=['unknown-model', 'wrong-type', 'unknown-field'],
    )
    def test_refuses_a_bad_request(
        self, make_client: MakeClient, body: bytes, status: int, code: str
    ) -> None:
        client = make_client()

        response = client.post(
            '/v1/warm', content=body, headers={'content-type': 'application/json'}
        )

        assert response.status_code == status
        assert error_code(response.json()) == code


class TestHealth:
    def test_reports_no_model_before_the_first_clip(
        self, make_client: MakeClient
    ) -> None:
        client = make_client()

        response = client.get('/health')

        assert response.status_code == 200
        assert response.json() == {
            'status': 'ok',
            'loaded_model': None,
            'default_model': 'qwen3-asr-1.7b',
            'models': MODEL_IDS,
        }

    def test_reports_the_model_a_clip_loaded(self, make_client: MakeClient) -> None:
        client = make_client()
        post_clip(client, encode_tone(0.5), 'whisper-large-v3-turbo')

        response = client.get('/health')

        assert response.json()['loaded_model'] == 'whisper-large-v3-turbo'


def test_an_unknown_route_answers_in_the_same_error_shape(
    make_client: MakeClient,
) -> None:
    client = make_client()

    response = client.get('/v1/models')

    assert response.status_code == 404
    assert error_code(response.json()) == 'not_found'


@pytest.mark.parametrize(
    ('path', 'logged'),
    [('/health?token=invented', '/health'), ('/health', '/health')],
    ids=['with-query', 'without-query'],
)
def test_the_access_log_drops_the_query_string(path: str, logged: str) -> None:
    record = logging.LogRecord(
        'uvicorn.access',
        logging.INFO,
        __file__,
        0,
        '%s - "%s %s HTTP/%s" %d',
        ('127.0.0.1:5000', 'GET', path, '1.1', 200),
        None,
    )

    strip_query(record)

    assert record.getMessage() == f'127.0.0.1:5000 - "GET {logged} HTTP/1.1" 200'


def test_the_access_log_drops_a_live_request_and_the_account_it_names() -> None:
    record = logging.LogRecord(
        'uvicorn.access',
        logging.INFO,
        __file__,
        0,
        '%s - "%s %s HTTP/%s" %d',
        ('127.0.0.1:5000', 'PUT', '/v1/live/invented-user.turn-1?from=0', '1.1', 200),
        None,
    )

    assert not strip_query(record)


def error_code(body: object) -> object:
    assert isinstance(body, dict)
    error = body['error']
    assert isinstance(error, dict)
    assert isinstance(error['message'], str) and error['message']
    return error['code']
