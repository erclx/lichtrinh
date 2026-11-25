"""The faster-whisper worker, for turbo by repository and PhoWhisper from its
converted folder. Usage: python -m voice.workers.whisper <model-id> <models-dir>
"""

import ctypes
import importlib.util
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from voice.decode import Samples
from voice.models import Family, Language, find_model
from voice.workers.loop import Recognizer, serve
from voice.workers.speech import load_speech
from voice.workers.steps import Spans, cut_at_pauses

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

# CTranslate2 links cuBLAS 12 and cuDNN 9 by name, and the wheels install them
# outside any library path, so they load by path before it looks.
CUDA_LIBRARIES = (
    ('nvidia.cublas', ('libcublasLt.so.12', 'libcublas.so.12')),
    ('nvidia.cudnn', ('libcudnn*.so.9',)),
)


def preload_cuda_libraries() -> None:
    for package, patterns in CUDA_LIBRARIES:
        spec = importlib.util.find_spec(package)
        if spec is None or not spec.submodule_search_locations:
            raise ImportError(f'{package} is not installed; run uv sync --group gpu')
        folder = Path(next(iter(spec.submodule_search_locations))) / 'lib'
        for pattern in patterns:
            for library in sorted(folder.glob(pattern)):
                ctypes.CDLL(str(library), mode=ctypes.RTLD_GLOBAL)


class WhisperRecognizer:
    def __init__(self, whisper: WhisperModel, spans: Spans) -> None:
        self._whisper = whisper
        self._spans = spans

    def transcribe(self, samples: Samples, language: Language) -> str:
        return self._final(samples, language) if self._spans(samples) else ''

    def live(
        self, samples: Samples, language: Language, state: object
    ) -> tuple[str, object]:
        return cut_at_pauses(
            samples,
            state,
            spans=self._spans,
            final=lambda heard: self._final(heard, language),
            partial=lambda heard: self._partial(heard, language),
        )

    def _final(self, samples: Samples, language: Language) -> str:
        segments, _ = self._whisper.transcribe(
            samples, language=language.value, beam_size=5
        )
        return ' '.join(segment.text.strip() for segment in segments)

    def _partial(self, samples: Samples, language: Language) -> str:
        """The open phrase, which the next step writes again."""
        segments, _ = self._whisper.transcribe(
            samples,
            language=language.value,
            beam_size=1,
            temperature=0.0,
            condition_on_previous_text=False,
            without_timestamps=True,
        )
        return ' '.join(segment.text.strip() for segment in segments)


def load(model_id: str, models_dir: Path) -> Recognizer:
    model = find_model(model_id)
    if model is None or model.family is not Family.WHISPER:
        raise ValueError(f'not a Whisper model: {model_id}')
    preload_cuda_libraries()
    from faster_whisper import WhisperModel

    where = str(models_dir / model.id) if model.converted else model.source
    whisper = WhisperModel(where, device='cuda', compute_type='float16')
    return WhisperRecognizer(whisper, load_speech())


def main() -> int:
    model_id, models_dir = sys.argv[1], Path(sys.argv[2])
    return serve(lambda: load(model_id, models_dir))


if __name__ == '__main__':
    sys.exit(main())
