import asyncio
import socket
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[4]


@asynccontextmanager
async def serve(app):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen(128)
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    for _ in range(200):
        if server.started:
            break
        await asyncio.sleep(0.01)
    try:
        yield port
    finally:
        server.should_exit = True
        await task
        sock.close()
