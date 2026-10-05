"""A serialized stdio bridge per host session. All context processing stays in Node."""
import json
import os
import queue
import signal
import subprocess
import threading
from pathlib import Path


class Proxy:
    def __init__(self, root, session_id):
        self.root = str(Path(root).resolve(strict=True))
        self.session_id = session_id
        self.lock = threading.RLock()
        self.process = None
        self.responses = None

    def _start(self):
        bridge = Path(__file__).parent / "mcp" / "bridge.mjs"
        self.process = subprocess.Popen(
            ["node", str(bridge), self.root, self.session_id], cwd=self.root,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", start_new_session=(os.name != "nt"),
        )
        responses = self.responses = queue.Queue()
        process = self.process
        diagnostic = {"stderr": ""}

        def read_errors():
            for chunk in iter(lambda: process.stderr.read(1024), ""):
                diagnostic["stderr"] = (diagnostic["stderr"] + chunk)[-8000:]

        errors = threading.Thread(target=read_errors, daemon=True)
        errors.start()

        def read():
            try:
                for line in process.stdout:
                    responses.put(json.loads(line))
            except Exception as error:
                responses.put({"ok": False, "error": str(error)})
            finally:
                errors.join(timeout=0.1)
                responses.put({"ok": False, "error": "MCP bridge disconnected; call not replayed. " + diagnostic["stderr"]})

        threading.Thread(target=read, daemon=True).start()

    def call(self, name, arguments=None):
        with self.lock:
            if self.process is None or self.process.poll() is not None:
                self.close()
                self._start()
            try:
                request = {"name": name, "arguments": arguments or {}}
                process, responses = self.process, self.responses
                process.stdin.write(json.dumps(request) + "\n")
                process.stdin.flush()
                response = responses.get(timeout=690)
                if not response.get("ok"):
                    raise RuntimeError(response.get("error", "MCP bridge failed"))
                value = response["value"]
                if name == "session_resume" and not value.get("isError"):
                    self.session_id = value["structuredContent"]["sessionId"]
                return value
            except Exception:
                self.close()
                raise  # Never replay a possibly dispatched mutation.

    def close(self):
        # Closing is also the explicit cancellation path, so it must not wait for call's lock.
        process, self.process = self.process, None
        if process is None:
            return
        if process.poll() is None:
            # Signal the bridge only: it sends MCP cancellation before closing the server.
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                if os.name != "nt":
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                process.kill()
                process.wait(timeout=2)
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream:
                stream.close()
