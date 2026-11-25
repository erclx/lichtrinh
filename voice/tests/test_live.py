from collections.abc import Callable

import pytest

from voice.live import LiveTurns
from voice.models import MODELS, Language

QWEN, TURBO, _ = MODELS
VI = Language.VIETNAMESE


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def turns(clock: Clock) -> LiveTurns:
    return LiveTurns(clock=clock)


Send = Callable[[str, int, bytes], tuple[int, bool]]


@pytest.fixture
def send(turns: LiveTurns) -> Send:
    """Sends a piece and reads back the bytes held and whether it grew the turn."""

    def piece(turn_id: str, start: int, audio: bytes) -> tuple[int, bool]:
        turn, grew = turns.hear(turn_id, start, audio)
        return (0 if turn is None else len(turn.audio), grew)

    return piece


def test_appends_a_piece_starting_where_the_turn_ends(
    turns: LiveTurns, send: Send
) -> None:
    send('one', 0, b'abc')

    assert send('one', 3, b'def') == (6, True)
    turn, _ = turns.hear('one', 6, b'!')
    assert turn is not None
    assert bytes(turn.audio) == b'abcdef!'


@pytest.mark.parametrize(
    ('start', 'audio'),
    [(0, b'abc'), (0, b'abcdef'), (2, b'cdef'), (5, b'gap')],
    ids=['repeat', 'longer-repeat', 'overlap', 'gap'],
)
def test_a_piece_out_of_place_changes_nothing_and_says_where_to_resume(
    turns: LiveTurns, send: Send, start: int, audio: bytes
) -> None:
    send('one', 0, b'abc')

    assert send('one', start, audio) == (3, False)
    turn, _ = turns.hear('one', 3, b'')
    assert turn is not None
    assert bytes(turn.audio) == b'abc'


def test_an_unknown_turn_asks_for_the_clip_from_its_start(send: Send) -> None:
    assert send('one', 4096, b'later bytes') == (0, False)
    # Nothing was kept, so the turn still starts from its own first byte.
    assert send('one', 0, b'abc') == (3, True)


def test_two_turns_never_share_bytes(send: Send) -> None:
    send('one', 0, b'abc')

    assert send('two', 0, b'x') == (1, True)
    assert send('one', 3, b'd') == (4, True)


def test_drops_a_turn_fifteen_seconds_untouched(send: Send, clock: Clock) -> None:
    send('one', 0, b'abc')
    clock.now += 15

    assert send('one', 3, b'def') == (0, False)


def test_a_piece_keeps_its_turn(send: Send, clock: Clock) -> None:
    send('one', 0, b'abc')
    clock.now += 14
    send('one', 3, b'def')
    clock.now += 14

    assert send('one', 6, b'ghi') == (9, True)


def test_an_untouched_turn_leaves_memory_without_another_call(
    turns: LiveTurns, send: Send, clock: Clock
) -> None:
    send('one', 0, b'abc')
    clock.now += 15

    turns.drop_untouched()

    assert len(turns) == 0


def test_a_fifth_turn_takes_the_place_of_the_one_longest_untouched(
    turns: LiveTurns, send: Send, clock: Clock
) -> None:
    for name in ('one', 'two', 'three', 'four'):
        send(name, 0, b'abc')
        clock.now += 1
    send('one', 3, b'd')

    send('five', 0, b'abc')

    assert len(turns) == 4
    assert send('two', 3, b'd') == (0, False)
    assert send('one', 4, b'e') == (5, True)


def test_a_turn_changing_model_starts_its_steps_again(turns: LiveTurns) -> None:
    turn, _ = turns.hear('one', 0, b'abc')
    assert turn is not None
    turn.speak(QWEN, VI)
    turn.state = {'steps': 3}

    turn.speak(QWEN, VI)
    kept = turn.state
    turn.speak(TURBO, VI)

    assert kept == {'steps': 3}
    assert turn.state is None
