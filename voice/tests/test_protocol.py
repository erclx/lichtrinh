import asyncio
import io
import struct

import pytest

from voice.protocol import (
    MAX_PAYLOAD,
    Frame,
    PipeClosedError,
    ProtocolError,
    encode,
    read_frame,
    read_frame_async,
    write_frame,
)


class TrickleStream(io.RawIOBase):
    """A pipe that hands back one byte per read, as a busy pipe can."""

    def __init__(self, data: bytes) -> None:
        self._data = io.BytesIO(data)

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        return self._data.read(min(size, 1) if size > 0 else 1)


def test_a_frame_survives_a_round_trip() -> None:
    sent = Frame({'op': 'transcribe', 'samples': 3}, b'\x00\x01\x02\x03' * 3)
    pipe = io.BytesIO()

    write_frame(pipe, sent)
    pipe.seek(0)

    assert read_frame(pipe) == sent


def test_reads_a_frame_split_across_many_reads() -> None:
    sent = Frame({'ok': True, 'text': 'invented'}, b'abcd')

    received = read_frame(TrickleStream(encode(sent)))

    assert received == sent


@pytest.mark.parametrize(
    'cut',
    [0, 3, 9, -1],
    ids=['nothing', 'mid-prefix', 'mid-header', 'mid-payload'],
)
def test_a_closed_pipe_raises_closed(cut: int) -> None:
    whole = encode(Frame({'ok': True}, b'abcd'))

    with pytest.raises(PipeClosedError):
        read_frame(io.BytesIO(whole[:cut]))


@pytest.mark.parametrize(
    'wire',
    [
        struct.pack('>II', 7, 0) + b'[1,2,3]',
        struct.pack('>II', 5, 0) + b'{oops',
        struct.pack('>II', 2, MAX_PAYLOAD + 1) + b'{}',
    ],
    ids=['not-an-object', 'not-json', 'payload-too-large'],
)
def test_a_malformed_frame_raises(wire: bytes) -> None:
    with pytest.raises(ProtocolError):
        read_frame(io.BytesIO(wire))


async def test_the_async_reader_reads_a_frame_fed_in_pieces() -> None:
    sent = Frame({'event': 'ready'}, b'\x01\x02')
    reader = asyncio.StreamReader()
    data = encode(sent)

    for index in range(len(data)):
        reader.feed_data(data[index : index + 1])
    received = await read_frame_async(reader)

    assert received == sent


async def test_the_async_reader_raises_closed_at_eof() -> None:
    reader = asyncio.StreamReader()
    reader.feed_data(encode(Frame({'ok': True}))[:5])
    reader.feed_eof()

    with pytest.raises(PipeClosedError):
        await read_frame_async(reader)
