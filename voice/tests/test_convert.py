from pathlib import Path

import pytest

from voice.convert import CONVERTED_FILES, convert, is_converted
from voice.models import MODELS

PHO = MODELS[2]


def fill(folder: Path, names: tuple[str, ...]) -> None:
    folder.mkdir(parents=True)
    for name in names:
        (folder / name).write_bytes(b'invented')


def test_skips_a_folder_already_converted(tmp_path: Path) -> None:
    fill(tmp_path / PHO.id, CONVERTED_FILES)

    converted = convert(PHO, tmp_path)

    assert not converted


@pytest.mark.parametrize(
    'missing', ['model.bin', 'tokenizer.json'], ids=['weights', 'tokenizer']
)
def test_reads_a_folder_missing_a_file_as_unconverted(
    tmp_path: Path, missing: str
) -> None:
    fill(tmp_path / PHO.id, tuple(n for n in CONVERTED_FILES if n != missing))

    assert not is_converted(tmp_path / PHO.id)
