"""The speech models the admin can pick, in the order a picker shows them."""

from dataclasses import dataclass
from enum import StrEnum


class Family(StrEnum):
    QWEN = 'qwen'
    WHISPER = 'whisper'


@dataclass(frozen=True, slots=True)
class Model:
    id: str
    family: Family
    # The Hugging Face repository the weights come from.
    source: str
    # True when the worker reads a CTranslate2 folder converted from `source`
    # into the models directory, rather than the repository itself.
    converted: bool = False


MODELS = (
    Model('qwen3-asr-1.7b', Family.QWEN, 'Qwen/Qwen3-ASR-1.7B'),
    Model(
        'whisper-large-v3-turbo',
        Family.WHISPER,
        'mobiuslabsgmbh/faster-whisper-large-v3-turbo',
    ),
    Model('phowhisper-large', Family.WHISPER, 'vinai/PhoWhisper-large', converted=True),
)
DEFAULT_MODEL = MODELS[0]


def find_model(model_id: str) -> Model | None:
    return next((model for model in MODELS if model.id == model_id), None)
