"""How each model family writes one live step, with its model calls passed in so
the rules run with no card. A step's state crosses back as JSON and returns on
the next, so a worker holds nothing of a turn between two of them."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ConfigDict

from voice.decode import SAMPLE_RATE, Samples

# The silence check can place a word's start a little late.
LEAD = SAMPLE_RATE // 10
PAUSE = SAMPLE_RATE // 2

# The newest tokens are the ones a model still changes its mind about.
ROLLBACK_TOKENS = 5
FRESH_STEPS = 2


@dataclass(frozen=True, slots=True)
class Span:
    """One stretch of speech, in samples."""

    start: int
    end: int


Spans = Callable[[Samples], list[Span]]


class Tokens(Protocol):
    def encode(self, text: str) -> list[int]: ...

    def decode(self, ids: list[int]) -> str: ...


class _Continued(BaseModel):
    model_config = ConfigDict(extra='forbid')

    # None until the first speech, so a silent start is never read.
    start: int | None = None
    text: str = ''
    steps: int = 0


class _Phrases(BaseModel):
    model_config = ConfigDict(extra='forbid')

    cut: int = 0
    done: list[str] = []


def keep_text(text: str, tokens: Tokens) -> str:
    """The text less its last tokens, dropping more rather than split a letter."""
    ids = tokens.encode(text)
    end = len(ids) - ROLLBACK_TOKENS
    while end > 0:
        kept = tokens.decode(ids[:end])
        if '�' not in kept:
            return kept
        end -= 1
    return ''


def continue_text(
    samples: Samples,
    state: object,
    *,
    spans: Spans,
    tokens: Tokens,
    generate: Callable[[Samples, str], str],
) -> tuple[str, object]:
    """Feeds the turn so far and the model's own last text back to it, less the
    newest tokens, so a long turn costs only its new words."""
    turn = _Continued.model_validate(state or {})
    if turn.start is None:
        found = spans(samples)
        if not found:
            return '', turn.model_dump()
        turn.start = max(0, found[0].start - LEAD)
    prefix = keep_text(turn.text, tokens) if turn.steps >= FRESH_STEPS else ''
    turn.text = generate(samples[turn.start :], prefix)
    turn.steps += 1
    return turn.text.strip(), turn.model_dump()


def cut_at_pauses(
    samples: Samples,
    state: object,
    *,
    spans: Spans,
    final: Callable[[Samples], str],
    partial: Callable[[Samples], str],
) -> tuple[str, object]:
    """Closes each phrase a pause or another phrase follows, for good, and
    redoes the open one alone."""
    turn = _Phrases.model_validate(state or {})
    rest = samples[turn.cut :]
    found = spans(rest)
    while found and _closed(rest, found):
        phrase = found[0]
        heard = rest[max(0, phrase.start - LEAD) : phrase.end + LEAD]
        turn.done.append(final(heard).strip())
        turn.cut += phrase.end
        rest = samples[turn.cut :]
        found = spans(rest)
    written = list(turn.done)
    if found:
        written.append(partial(rest[max(0, found[0].start - LEAD) :]).strip())
    return ' '.join(filter(None, written)), turn.model_dump()


def _closed(rest: Samples, found: Sequence[Span]) -> bool:
    return len(found) > 1 or len(rest) - found[0].end >= PAUSE
