"""Reads a multipart upload into memory, since Starlette's own parser spools any
part past 1 MB to a temporary file and a clip must never touch disk."""

from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import MultipartParser, parse_options_header


class FormError(ValueError):
    """The body is not a multipart form."""


def parse_form(body: bytes, content_type: str) -> dict[str, bytes]:
    """Returns each part's bytes by its field name. A repeated name keeps the last."""
    kind, options = parse_options_header(content_type)
    boundary = options.get(b'boundary')
    if kind != b'multipart/form-data' or not boundary:
        raise FormError('expected multipart/form-data with a boundary')

    parts: dict[str, bytes] = {}
    field: list[bytes] = []
    value: list[bytes] = []
    name: list[str] = []
    data: list[bytes] = []

    def on_header_field(chunk: bytes, start: int, end: int) -> None:
        field.append(chunk[start:end])

    def on_header_value(chunk: bytes, start: int, end: int) -> None:
        value.append(chunk[start:end])

    def on_header_end() -> None:
        if b''.join(field).lower() == b'content-disposition':
            _, params = parse_options_header(b''.join(value))
            name.append(params.get(b'name', b'').decode('utf-8', 'replace'))
        field.clear()
        value.clear()

    def on_part_data(chunk: bytes, start: int, end: int) -> None:
        data.append(chunk[start:end])

    def on_part_end() -> None:
        if name:
            parts[name[-1]] = b''.join(data)
        name.clear()
        data.clear()

    parser = MultipartParser(
        boundary,
        {
            'on_header_field': on_header_field,
            'on_header_value': on_header_value,
            'on_header_end': on_header_end,
            'on_part_data': on_part_data,
            'on_part_end': on_part_end,
        },
    )
    try:
        parser.write(body)
        parser.finalize()
    except MultipartParseError as error:
        raise FormError('malformed multipart body') from error
    return parts
