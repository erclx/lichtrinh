"""The faster-whisper worker, for turbo by repository and PhoWhisper from its
converted folder.

Usage: python -m voice.workers.whisper <model-id> <models-dir>
"""

import ctypes
import importlib.util
import sys
from pathlib import Path

from voice.decode import Samples
from voice.models import Family, find_model
from voice.workers.loop import Transcriber, serve

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


def load(model_id: str, models_dir: Path) -> Transcriber:
    model = find_model(model_id)
    if model is None or model.family is not Family.WHISPER:
        raise ValueError(f'not a Whisper model: {model_id}')
    preload_cuda_libraries()
    from faster_whisper import WhisperModel

    where = str(models_dir / model.id) if model.converted else model.source
    whisper = WhisperModel(where, device='cuda', compute_type='float16')

    def transcribe(samples: Samples) -> str:
        segments, _ = whisper.transcribe(samples, language='vi', beam_size=5)
        return ' '.join(segment.text.strip() for segment in segments)

    return transcribe


def main() -> int:
    model_id, models_dir = sys.argv[1], Path(sys.argv[2])
    return serve(lambda: load(model_id, models_dir))


if __name__ == '__main__':
    sys.exit(main())
