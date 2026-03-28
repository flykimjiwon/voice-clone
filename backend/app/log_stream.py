import asyncio
import logging
import sys
import threading
import time
from collections import deque


class LogBuffer:
    def __init__(self, maxlen: int = 500):
        self._lines: deque[dict] = deque(maxlen=maxlen)
        self._subscribers: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()
        self._thread_lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def _notify_subscribers(self, entry: dict):
        async with self._lock:
            dead = []
            for q in self._subscribers:
                try:
                    q.put_nowait(entry)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._subscribers.remove(q)

    async def push(self, line: str, level: str = "INFO"):
        entry = {
            "ts": time.time(),
            "level": level,
            "msg": line.rstrip(),
        }
        self._lines.append(entry)
        await self._notify_subscribers(entry)

    def push_sync(self, line: str, level: str = "INFO"):
        entry = {
            "ts": time.time(),
            "level": level,
            "msg": line.rstrip(),
        }
        with self._thread_lock:
            self._lines.append(entry)
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(
                asyncio.ensure_future,
                self._notify_subscribers(entry),
            )

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        for entry in list(self._lines)[-50:]:
            q.put_nowait(entry)
        async with self._lock:
            self._subscribers.append(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue):
        async with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def recent(self, n: int = 50) -> list[dict]:
        with self._thread_lock:
            return list(self._lines)[-n:]


log_buffer = LogBuffer()


class BufferLogHandler(logging.Handler):
    def __init__(self, buffer: LogBuffer):
        super().__init__()
        self._buffer = buffer
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def emit(self, record: logging.LogRecord):
        msg = self.format(record)
        level = record.levelname
        self._buffer.push_sync(msg, level)
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(
                asyncio.ensure_future,
                self._buffer.push(msg, level),
            )


class StdoutCapture:
    def __init__(self, original, buffer: LogBuffer):
        self._original = original
        self._buffer = buffer
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def name(self):
        return getattr(self._original, "name", "<capture>")

    @property
    def encoding(self):
        return getattr(self._original, "encoding", "utf-8")

    @property
    def errors(self):
        return getattr(self._original, "errors", "strict")

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def write(self, s: str):
        if self._original and not self._original.closed:
            self._original.write(s)
        if s and s.strip():
            self._buffer.push_sync(s.rstrip(), "STDOUT")
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(
                    asyncio.ensure_future,
                    self._buffer.push(s.rstrip(), "STDOUT"),
                )
        return len(s)

    def flush(self):
        if self._original and not self._original.closed:
            self._original.flush()

    def fileno(self):
        return self._original.fileno()

    def isatty(self):
        return False

    def readable(self):
        return False

    def writable(self):
        return True

    def seekable(self):
        return False

    def __getattr__(self, attr):
        return getattr(self._original, attr)


_handler = BufferLogHandler(log_buffer)
_handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))

_stdout_capture = StdoutCapture(sys.stdout, log_buffer)
_stderr_capture = StdoutCapture(sys.stderr, log_buffer)


def install_log_capture():
    root = logging.getLogger()
    root.addHandler(_handler)

    logging.getLogger("TTS").setLevel(logging.INFO)
    logging.getLogger("tqdm").setLevel(logging.INFO)

    sys.stdout = _stdout_capture
    sys.stderr = _stderr_capture


def set_event_loop(loop: asyncio.AbstractEventLoop):
    log_buffer.set_loop(loop)
    _handler.set_loop(loop)
    _stdout_capture.set_loop(loop)
    _stderr_capture.set_loop(loop)
