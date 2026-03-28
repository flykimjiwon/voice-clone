import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .routers.tts import router as tts_router
from .routers.vocal import router as vocal_router
from .log_stream import log_buffer, install_log_capture, set_event_loop

install_log_capture()


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    set_event_loop(loop)
    yield


app = FastAPI(title="TTS Comparison API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tts_router)
app.include_router(vocal_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/logs/stream")
async def stream_logs():
    async def event_generator():
        queue = await log_buffer.subscribe()
        try:
            while True:
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=30)
                    yield {"data": json.dumps(entry, ensure_ascii=False)}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        except asyncio.CancelledError:
            pass
        finally:
            await log_buffer.unsubscribe(queue)

    return EventSourceResponse(event_generator())


@app.get("/api/logs/recent")
async def recent_logs(n: int = 50):
    return {"logs": log_buffer.recent(n)}
