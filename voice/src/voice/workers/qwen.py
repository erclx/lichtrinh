"""The Qwen3-ASR worker, on the CUDA 13 stack torch brings.

Usage: python -m voice.workers.qwen <model-id> <models-dir>
"""

import sys
from pathlib import Path

from voice.decode import SAMPLE_RATE, Samples
from voice.models import Family, find_model
from voice.workers.loop import Transcriber, serve


def load(model_id: str) -> Transcriber:
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

    def transcribe(samples: Samples) -> str:
        results = asr.transcribe(audio=(samples, SAMPLE_RATE), language='Vietnamese')
        return str(results[0].text)

    return transcribe


def main() -> int:
    model_id, _models_dir = sys.argv[1], Path(sys.argv[2])
    return serve(lambda: load(model_id))


if __name__ == '__main__':
    sys.exit(main())
