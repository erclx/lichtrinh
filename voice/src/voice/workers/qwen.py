"""The Qwen3-ASR worker, on the CUDA 13 stack torch brings.
Usage: python -m voice.workers.qwen <model-id> <models-dir>
"""

import sys
from pathlib import Path
from typing import TYPE_CHECKING

from voice.decode import SAMPLE_RATE, Samples
from voice.models import Family, Language, find_model
from voice.workers.loop import Recognizer, serve
from voice.workers.speech import load_speech
from voice.workers.steps import Spans, continue_text

if TYPE_CHECKING:
    from qwen_asr import Qwen3ASRModel

SPOKEN = {Language.VIETNAMESE: 'Vietnamese', Language.ENGLISH: 'English'}

# A step that continues its text writes a few words, and a fresh one a few more.
LIVE_TOKENS = 256


class QwenRecognizer:
    def __init__(self, asr: Qwen3ASRModel, spans: Spans) -> None:
        self._asr = asr
        self._spans = spans

    def transcribe(self, samples: Samples, language: Language) -> str:
        if not self._spans(samples):
            return ''
        results = self._asr.transcribe(
            audio=(samples, SAMPLE_RATE), language=SPOKEN[language]
        )
        return str(results[0].text)

    def live(
        self, samples: Samples, language: Language, state: object
    ) -> tuple[str, object]:
        return continue_text(
            samples,
            state,
            spans=self._spans,
            tokens=self._asr.processor.tokenizer,
            generate=lambda heard, prefix: self._generate(heard, language, prefix),
        )

    def _generate(self, samples: Samples, language: Language, prefix: str) -> str:
        """Writes on from `prefix`, as qwen-asr's own streaming step does, which
        refuses the transformers backend this worker holds."""
        import torch

        asr = self._asr
        prompt = asr._build_text_prompt(context='', force_language=SPOKEN[language])
        inputs = asr.processor(
            text=[prompt + prefix], audio=[samples], return_tensors='pt', padding=True
        )
        inputs = inputs.to(asr.model.device).to(asr.model.dtype)
        with torch.inference_mode():
            written = asr.model.generate(**inputs, max_new_tokens=LIVE_TOKENS)
        decoded = asr.processor.batch_decode(
            written.sequences[:, inputs['input_ids'].shape[1] :],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )
        return prefix + str(decoded[0])


def load(model_id: str) -> Recognizer:
    import torch
    from qwen_asr import Qwen3ASRModel

    model = find_model(model_id)
    if model is None or model.family is not Family.QWEN:
        raise ValueError(f'not a Qwen model: {model_id}')
    asr = Qwen3ASRModel.from_pretrained(
        model.source,
        dtype=torch.bfloat16,
        device_map='cuda:0',
        max_inference_batch_size=1,
    )
    return QwenRecognizer(asr, load_speech())


def main() -> int:
    model_id, _models_dir = sys.argv[1], Path(sys.argv[2])
    return serve(lambda: load(model_id))


if __name__ == '__main__':
    sys.exit(main())
