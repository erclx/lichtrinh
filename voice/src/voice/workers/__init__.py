"""Model workers, each run as its own process so two CUDA stacks never share one."""

import sys
from pathlib import Path

from voice.models import Model


def worker_command(model: Model, models_dir: Path) -> list[str]:
    """The command line that starts the worker for `model`'s family."""
    module = f'voice.workers.{model.family.value}'
    return [sys.executable, '-m', module, model.id, str(models_dir)]
