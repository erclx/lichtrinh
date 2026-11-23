import pytest

from voice.form import FormError, encode_form, parse_form


def test_a_form_survives_a_round_trip() -> None:
    clip = bytes(range(256)) * 8
    content_type, body = encode_form(
        {'file': clip, 'model': b'phowhisper-large'}, 'invented-boundary'
    )

    parts = parse_form(body, content_type)

    assert parts == {'file': clip, 'model': b'phowhisper-large'}


@pytest.mark.parametrize(
    ('body', 'content_type'),
    [
        (b'{}', 'application/json'),
        (b'--x\r\n', 'multipart/form-data'),
        (b'not a form', 'multipart/form-data; boundary=x'),
    ],
    ids=['json', 'no-boundary', 'malformed'],
)
def test_refuses_a_body_that_is_not_a_form(body: bytes, content_type: str) -> None:
    with pytest.raises(FormError):
        parse_form(body, content_type)
