"""The `voice` command: run the server, fetch the models, or transcribe one clip."""

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from voice.config import HOST, Settings
from voice.form import encode_form
from voice.models import MODELS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='voice', description=__doc__)
    verbs = parser.add_subparsers(dest='verb', required=True)
    verbs.add_parser('serve', help=f'serve transcriptions on {HOST}')
    verbs.add_parser('models', help='download every model and convert PhoWhisper')
    transcribe = verbs.add_parser(
        'transcribe', help='send one clip to the running server and print its text'
    )
    transcribe.add_argument('path', type=Path)
    transcribe.add_argument('--model', choices=[model.id for model in MODELS])
    args = parser.parse_args(argv)

    settings = Settings()
    if args.verb == 'serve':
        from voice.server import serve

        serve(settings)
        return 0
    if args.verb == 'models':
        return fetch_models(settings)
    return transcribe_clip(settings, args.path, args.model)


def fetch_models(settings: Settings) -> int:
    from huggingface_hub import snapshot_download

    from voice.convert import convert

    for model in MODELS:
        print(f'{model.id}: fetching {model.source}', flush=True)
        snapshot_download(model.source)
        if model.converted:
            print(f'{model.id}: converting into {settings.models_dir}', flush=True)
            converted = convert(model, settings.models_dir)
            print(f'{model.id}: {"converted" if converted else "already converted"}')
        print(f'{model.id}: ready', flush=True)
    return 0


def transcribe_clip(settings: Settings, path: Path, model: str | None) -> int:
    fields = {'file': path.read_bytes()}
    if model is not None:
        fields['model'] = model.encode()
    content_type, body = encode_form(fields, uuid.uuid4().hex)
    url = f'http://{HOST}:{settings.port}/v1/audio/transcriptions'
    request = urllib.request.Request(
        url, data=body, headers={'Content-Type': content_type}, method='POST'
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            reply = json.load(response)
    except urllib.error.HTTPError as error:
        refusal = json.load(error).get('error', {})
        print(
            f'voice: {refusal.get("code")}: {refusal.get("message")}', file=sys.stderr
        )
        return 1
    except urllib.error.URLError:
        print(
            f'voice: no server on {HOST}:{settings.port}. '
            'Start it with lichtrinh voice serve.',
            file=sys.stderr,
        )
        return 1
    timings = reply['timings']
    print(reply['text'])
    print(
        f'{reply["model"]}: {reply["duration_seconds"]:.1f}s clip, '
        f'load {timings["load_seconds"]:.2f}s, '
        f'transcribe {timings["transcribe_seconds"]:.2f}s',
        file=sys.stderr,
    )
    return 0
