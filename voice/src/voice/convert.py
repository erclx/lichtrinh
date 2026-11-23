"""Converts a Transformers Whisper checkpoint into the CTranslate2 folder
faster-whisper reads, once, into the models directory."""

import shutil
from pathlib import Path

from voice.models import Model

COPIED_FILES = ('tokenizer.json', 'preprocessor_config.json')
CONVERTED_FILES = ('model.bin', 'config.json', 'vocabulary.json', *COPIED_FILES)


def converted_folder(model: Model, models_dir: Path) -> Path:
    return models_dir / model.id


def is_converted(folder: Path) -> bool:
    return all((folder / name).is_file() for name in CONVERTED_FILES)


def convert(model: Model, models_dir: Path) -> bool:
    """Converts `model` unless a complete folder is already there. Returns
    whether it converted. A run cut short leaves only a `.partial` folder,
    which the next run clears."""
    target = converted_folder(model, models_dir)
    if is_converted(target):
        return False
    from ctranslate2.converters import TransformersConverter

    partial = target.with_name(f'{target.name}.partial')
    shutil.rmtree(partial, ignore_errors=True)
    partial.parent.mkdir(parents=True, exist_ok=True)
    converter = TransformersConverter(model.source, copy_files=list(COPIED_FILES))
    converter.convert(str(partial), quantization='float16')
    shutil.rmtree(target, ignore_errors=True)
    partial.rename(target)
    return True
