import json

import numpy as np

from voice.decode import SAMPLE_RATE, Samples
from voice.workers.steps import Span, continue_text, cut_at_pauses, keep_text


def audio(seconds: float) -> Samples:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)


def at(seconds: float) -> int:
    return int(seconds * SAMPLE_RATE)


class ByteTokens:
    """One token a byte, so a Vietnamese letter spans two or three of them."""

    def encode(self, text: str) -> list[int]:
        return list(text.encode())

    def decode(self, ids: list[int]) -> str:
        return bytes(ids).decode(errors='replace')


class FakeModel:
    """Writes `said` after whatever prefix it was fed, and keeps every call."""

    def __init__(self, said: str) -> None:
        self.said = said
        self.calls: list[tuple[int, str]] = []

    def __call__(self, samples: Samples, prefix: str) -> str:
        self.calls.append((len(samples), prefix))
        return prefix + self.said


class TestKeepText:
    def test_drops_the_last_five_tokens(self) -> None:
        assert keep_text('abcdefghij', ByteTokens()) == 'abcde'

    def test_keeps_nothing_of_a_text_five_tokens_long(self) -> None:
        assert keep_text('abcde', ByteTokens()) == ''

    def test_drops_further_tokens_over_splitting_a_letter(self) -> None:
        # Five bytes back lands inside the three-byte letter.
        assert keep_text('một ề1234', ByteTokens()) == 'một '


class TestContinueText:
    def step(
        self,
        model: FakeModel,
        samples: Samples,
        state: object = None,
        spans: tuple[Span, ...] = (Span(0, 1),),
    ) -> tuple[str, object]:
        return continue_text(
            samples,
            state,
            spans=lambda _: list(spans),
            tokens=ByteTokens(),
            generate=model,
        )

    def test_shows_nothing_and_asks_nothing_before_any_speech(self) -> None:
        model = FakeModel('invented')

        text, _ = self.step(model, audio(2), spans=())

        assert text == ''
        assert model.calls == []

    def test_starts_a_tenth_of_a_second_before_the_first_speech(self) -> None:
        model = FakeModel('invented')

        self.step(model, audio(3), spans=(Span(at(1), at(3)),))

        assert model.calls == [(at(2.1), '')]

    def test_starts_afresh_on_the_first_two_steps(self) -> None:
        model = FakeModel('invented words')

        _, state = self.step(model, audio(1))
        self.step(model, audio(2), state)

        assert [prefix for _, prefix in model.calls] == ['', '']

    def test_continues_its_own_text_from_the_third_step(self) -> None:
        model = FakeModel('0123456789')
        _, state = self.step(model, audio(1))
        _, state = self.step(model, audio(2), state)

        text, _ = self.step(model, audio(3), state)

        assert model.calls[2][1] == '01234'
        assert text == '012340123456789'

    def test_keeps_its_start_though_the_silence_check_moves(self) -> None:
        model = FakeModel('invented')
        _, state = self.step(model, audio(2), spans=(Span(at(1), at(2)),))

        self.step(model, audio(3), state, spans=(Span(at(1.5), at(3)),))

        assert model.calls[1][0] == at(2.1)

    def test_its_state_crosses_a_pipe_as_json(self) -> None:
        model = FakeModel('0123456789')
        _, state = self.step(model, audio(1))
        _, state = self.step(model, audio(2), json.loads(json.dumps(state)))

        self.step(model, audio(3), json.loads(json.dumps(state)))

        assert model.calls[2][1] == '01234'


class FakePhrases:
    """Names the seconds each call was given, so a test reads which were redone."""

    def __init__(self) -> None:
        self.final: list[float] = []
        self.partial: list[float] = []

    def write_final(self, samples: Samples) -> str:
        self.final.append(round(len(samples) / SAMPLE_RATE, 2))
        return f'phrase{len(self.final)}'

    def write_partial(self, samples: Samples) -> str:
        self.partial.append(round(len(samples) / SAMPLE_RATE, 2))
        return 'open'


class TestCutAtPauses:
    def step(
        self,
        model: FakePhrases,
        samples: Samples,
        spoken: list[tuple[float, float]],
        state: object = None,
    ) -> tuple[str, object]:
        """`spoken` is in seconds of the whole turn, as a listener would hear it."""

        def spans(rest: Samples) -> list[Span]:
            cut = len(samples) - len(rest)
            return [
                Span(max(0, at(start) - cut), at(end) - cut)
                for start, end in spoken
                if at(end) > cut
            ]

        return cut_at_pauses(
            samples,
            state,
            spans=spans,
            final=model.write_final,
            partial=model.write_partial,
        )

    def test_shows_nothing_and_asks_nothing_before_any_speech(self) -> None:
        model = FakePhrases()

        text, _ = self.step(model, audio(2), [])

        assert text == ''
        assert (model.final, model.partial) == ([], [])

    def test_a_phrase_stays_open_short_of_half_a_second_of_silence(self) -> None:
        model = FakePhrases()

        text, _ = self.step(model, audio(1.9), [(0, 1.5)])

        assert text == 'open'
        assert model.final == []

    def test_a_phrase_closes_at_half_a_second_of_silence(self) -> None:
        model = FakePhrases()

        text, _ = self.step(model, audio(2), [(0, 1.5)])

        assert text == 'phrase1'
        assert model.partial == []

    def test_a_phrase_closes_once_another_follows(self) -> None:
        model = FakePhrases()

        text, _ = self.step(model, audio(3), [(0, 1), (2, 3)])

        assert text == 'phrase1 open'

    def test_redoes_the_open_phrase_alone(self) -> None:
        model = FakePhrases()
        _, state = self.step(model, audio(3), [(0, 1), (2, 3)])

        text, _ = self.step(model, audio(4), [(0, 1), (2, 4)], state)

        assert text == 'phrase1 open'
        assert len(model.final) == 1
        # Each open phrase starts a tenth of a second before its speech.
        assert model.partial == [1.1, 2.1]

    def test_its_state_crosses_a_pipe_as_json(self) -> None:
        model = FakePhrases()
        _, state = self.step(model, audio(3), [(0, 1), (2, 3)])

        self.step(model, audio(4), [(0, 1), (2, 4)], json.loads(json.dumps(state)))

        assert len(model.final) == 1
