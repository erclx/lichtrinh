---
title: Benchmarks
description: Measured scores for the assistant's local models and the speech models, one table per suite, each with its date, hardware, runtime, and rerun command
---

# Benchmarks

Each table below is one suite, measured on the workspace PC's RTX 5090 with 32,607 MiB. Every input is invented or public. A rerun adds a dated row under its table and never overwrites an earlier one.

## Assistant

Each alias answers 15 invented requests twice, once with diacritics and once without, through the real prompt and tool loop over an in-memory trip. A turn passes when its tool call or answer matches the expected change.

- Date: 2026-11-23
- Runtime: Ollama 0.33.1, each alias at a 16,384-token context
- Rerun: `lichtrinh bridge eval --model <alias>`

| Alias                       | Model         | Score out of 30 | Median turn |
| --------------------------- | ------------- | --------------- | ----------- |
| `lichtrinh-assistant`       | `qwen3.8:27b` | 29              | 2.7 s       |
| `lichtrinh-assistant-gemma` | `gemma4:26b`  | 27              | 2.3 s       |

## Speech

Each model transcribed two sets one clip at a time, warm. FLEURS is the public Vietnamese dev split, 40 clips drawn with seed 7. Requests are 12 invented calendar requests in a synthetic voice. WER is read with numbers folded to words first.

- Date: 2026-11-21
- Runtime: faster-whisper 1.2.1 on CTranslate2 4.9.0 in float16 with beam 5, and Qwen3-ASR on qwen-asr 0.0.6 in bf16 on torch 2.15 for CUDA 13.2
- Rerun: none in the repository yet, since the run used a scratch harness outside it

| Model                    | FLEURS WER | FLEURS median | Requests WER | Requests median | Peak VRAM |
| ------------------------ | ---------- | ------------- | ------------ | --------------- | --------- |
| `qwen3-asr-1.7b`         | 4.6%       | 684 ms        | 8.8%         | 311 ms          | 4,480 MiB |
| `phowhisper-large`       | 7.2%       | 745 ms        | 11.6%        | 342 ms          | 4,249 MiB |
| `whisper-large-v3-turbo` | 8.3%       | 221 ms        | 10.9%        | 130 ms          | 2,097 MiB |
| `whisper-large-v3`       | 8.6%       | 679 ms        | 10.2%        | 331 ms          | 3,866 MiB |
| `phoasr-whisper-small`   | 9.0%       | 259 ms        | 11.6%        | 123 ms          | 1,200 MiB |
