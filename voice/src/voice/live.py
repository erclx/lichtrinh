"""The turns being spoken now, each the clip so far, held in memory alone and for
one turn. A worker stays stateless between steps, so a restart costs a step."""

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from voice.models import Language, Model

MAX_TURNS = 4
UNTOUCHED_SECONDS = 15.0


@dataclass(slots=True)
class Turn:
    touched: float
    audio: bytearray = field(default_factory=bytearray)
    # The last text any step wrote, kept through one that could not.
    text: str = ''
    state: object = None
    _spoken: tuple[Model, Language] | None = None

    def speak(self, model: Model, language: Language) -> None:
        """Starts the steps again under another model or language, since one
        model's state means nothing to the next."""
        if self._spoken != (model, language):
            self._spoken = (model, language)
            self.state = None

    def write(self, model: Model, language: Language, text: str, state: object) -> None:
        """Takes a step's words, unless the turn has moved to another model or
        language since the step began."""
        if self._spoken == (model, language):
            self.text, self.state = text, state


class LiveTurns:
    def __init__(
        self,
        *,
        most: int = MAX_TURNS,
        untouched_seconds: float = UNTOUCHED_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._most = most
        self._untouched_seconds = untouched_seconds
        self._clock = clock
        self._turns: dict[str, Turn] = {}

    def __len__(self) -> int:
        return len(self._turns)

    def hear(self, turn_id: str, start: int, piece: bytes) -> tuple[Turn | None, bool]:
        """The turn and whether the piece grew it, which it does only when it
        starts where the turn ends. No turn means this one is not held, so the
        caller sends its clip from the start."""
        self.drop_untouched()
        turn = self._turns.get(turn_id)
        if turn is None:
            if start > 0:
                return None, False
            turn = self._begin(turn_id)
        turn.touched = self._clock()
        if start != len(turn.audio):
            return turn, False
        turn.audio += piece
        return turn, True

    def drop_untouched(self) -> None:
        now = self._clock()
        for turn_id, turn in list(self._turns.items()):
            if now - turn.touched >= self._untouched_seconds:
                del self._turns[turn_id]

    def _begin(self, turn_id: str) -> Turn:
        if len(self._turns) >= self._most:
            oldest = min(self._turns, key=lambda held: self._turns[held].touched)
            del self._turns[oldest]
        turn = Turn(touched=self._clock())
        self._turns[turn_id] = turn
        return turn
