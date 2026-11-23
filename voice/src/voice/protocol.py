"""Frames between the server and a worker over the worker's stdin and stdout:
two big-endian uint32 lengths, a JSON object header, and a raw payload, so
samples cross as float32 bytes with no port or file between the two."""

import asyncio
import json
import struct
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import BinaryIO

PREFIX = struct.Struct('>II')
MAX_HEADER = 64 * 1024
# Ten times a 60 second clip at 16 kHz float32, so a broken peer cannot ask for gigabytes.
MAX_PAYLOAD = 40 * 1024 * 1024


class PipeClosedError(EOFError):
    """The other side closed its pipe before a whole frame arrived."""


class ProtocolError(ValueError):
    """The bytes on the pipe are not a frame."""


@dataclass(frozen=True, slots=True)
class Frame:
    header: dict[str, object]
    payload: bytes = field(default=b'')


def encode(frame: Frame) -> bytes:
    header = json.dumps(frame.header, separators=(',', ':')).encode()
    return PREFIX.pack(len(header), len(frame.payload)) + header + frame.payload


def write_frame(stream: BinaryIO, frame: Frame) -> None:
    stream.write(encode(frame))
    stream.flush()


def read_frame(stream: BinaryIO) -> Frame:
    def read_exact(size: int) -> bytes:
        parts: list[bytes] = []
        remaining = size
        while remaining:
            part = stream.read(remaining)
            if not part:
                raise PipeClosedError
            parts.append(part)
            remaining -= len(part)
        return b''.join(parts)

    return _assemble(read_exact)


async def read_frame_async(reader: asyncio.StreamReader) -> Frame:
    async def read_exact(size: int) -> bytes:
        try:
            return await reader.readexactly(size)
        except asyncio.IncompleteReadError as error:
            raise PipeClosedError from error

    header_size, payload_size = _lengths(await read_exact(PREFIX.size))
    header = _header(await read_exact(header_size))
    return Frame(header, await read_exact(payload_size))


def _assemble(read_exact: Callable[[int], bytes]) -> Frame:
    header_size, payload_size = _lengths(read_exact(PREFIX.size))
    header = _header(read_exact(header_size))
    return Frame(header, read_exact(payload_size))


def _lengths(prefix: bytes) -> tuple[int, int]:
    header_size, payload_size = PREFIX.unpack(prefix)
    if header_size > MAX_HEADER or payload_size > MAX_PAYLOAD:
        raise ProtocolError('frame past its size limit')
    return header_size, payload_size


def _header(raw: bytes) -> dict[str, object]:
    try:
        header: object = json.loads(raw)
    except ValueError as error:
        raise ProtocolError('header is not JSON') from error
    if not isinstance(header, dict):
        raise ProtocolError('header is not an object')
    return header
