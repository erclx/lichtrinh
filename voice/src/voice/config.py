"""The settings the owner can change through the environment, each prefixed VOICE_."""

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Fixed rather than a setting: the bridge on the same PC is the only caller,
# so the server never listens on a network interface.
HOST = '127.0.0.1'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='VOICE_')

    port: int = Field(default=8770, ge=1, le=65535)
    idle_seconds: float = Field(default=900, gt=0)
    models_dir: Path = Path('~/.local/share/lichtrinh/voice')

    @field_validator('models_dir')
    @classmethod
    def _expand_home(cls, value: Path) -> Path:
        return value.expanduser()
