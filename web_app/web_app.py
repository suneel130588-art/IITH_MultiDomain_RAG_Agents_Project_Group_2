"""Local web interface for the multi-domain RAG assistant (final v2.9 notebook pipeline)."""

from __future__ import annotations

import argparse
import base64
import hmac
import html
import json
import logging
import mimetypes
import os
import secrets
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, urlsplit

from MultiDomainAgent import DEFAULT_NOTEBOOK, build_assistant


PROJECT_DIR = Path(__file__).resolve().parent
STATIC_DIR = PROJECT_DIR / "static"
MAX_REQUEST_BYTES = 16_384
SESSION_COOKIE = "rag_session"
SESSION_SECONDS = 12 * 60 * 60
LOGGER = logging.getLogger("multidomain_rag.web")
DISCLAIMER = ""  # set from the notebook at start-up


def _serialize_result(result: dict[str, Any]) -> dict[str, Any]:
    router = result["triage"]  # the Router Agent's result
    domain_check = result["interaction_assessment"]

    return {
        "answer": result["answer"],
        "review_required": result["review_required"],
        "router": router.model_dump(mode="json"),
        "domain_check": domain_check.model_dump(mode="json"),
        "sources": [
            {
                "id": document.metadata["source_id"],
                "title": document.metadata["source"]
                + (f" — {document.metadata['title']}" if document.metadata.get("title") else ""),
                "domain": document.metadata["domain"],
                "url": document.metadata["dataset_url"],
                "excerpt": document.page_content,
            }
            for document in result.get("evidence", [])
        ],
        "drug_labels": [
            {
                "id": label["source_id"],
                "medication": label["medication"],
                "status": label["status"],
                "url": label["url"],
            }
            for label in result.get("drug_labels", [])
        ],
        "safety_notes": result.get("safety_notes", []),
        "disclaimer": DISCLAIMER,
    }


def _safe_next(target: str) -> str:
    """Only same-site paths may be used as the after-login redirect."""
    parts = urlsplit(target or "/")
    if parts.scheme or parts.netloc or not target.startswith("/") or target.startswith(("//", "/\\")):
        return "/"
    return target


def create_handler(assistant, password: str | None = None, username: str = "iith"):
    # With a password set (APP_PASSWORD), every page needs a login, so a shared tunnel link
    # cannot spend the Groq quota without it. Browsers sign in on the /login page (session
    # cookie); scripts such as run_30q_test.py may still send an HTTP Basic header.
    expected = (
        "Basic " + base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        if password
        else None
    )
    sessions: dict[str, float] = {}  # session token -> expiry (epoch seconds)

    class AssistantChatHandler(BaseHTTPRequestHandler):
        server_version = "MultiDomainRAG/2.9"

        def _session_token(self) -> str | None:
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
            except Exception:
                return None
            morsel = cookie.get(SESSION_COOKIE)
            return morsel.value if morsel else None

        def _logged_in(self) -> bool:
            if expected is None:
                return True
            supplied = self.headers.get("Authorization", "")
            if supplied and hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
                return True
            token = self._session_token()
            return bool(token) and sessions.get(token, 0) > time.time()

        def _authorized(self) -> bool:
            if self._logged_in():
                return True
            if self.path.startswith("/api/"):
                self._send_json(401, {"error": "Login required. Sign in again at /login."})
            else:
                self._redirect("/login?next=" + quote(self.path, safe=""))
            return False

        def _https(self) -> bool:
            # cloudflared and similar proxies terminate HTTPS and say so in these headers.
            return (self.headers.get("X-Forwarded-Proto", "").lower() == "https"
                    or '"https"' in self.headers.get("Cf-Visitor", ""))

        def _redirect(self, location: str, cookie: str | None = None) -> None:
            self.send_response(303)
            self.send_header("Location", location)
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def _login_page(self, error: bool, next_path: str) -> None:
            page = (STATIC_DIR / "login.html").read_text(encoding="utf-8")
            page = page.replace("{{NEXT}}", html.escape(_safe_next(next_path), quote=True))
            page = page.replace(
                "{{ERROR}}",
                '<p class="login-error" role="alert">Wrong login ID or password. Please try again.</p>' if error else "",
            )
            self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")

        def _handle_login(self) -> None:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > 2_048:
                self._redirect("/login?error=1")
                return
            form = parse_qs(self.rfile.read(length).decode("utf-8", "replace"))
            user = form.get("username", [""])[0]
            given = form.get("password", [""])[0]
            next_path = _safe_next(form.get("next", ["/"])[0])
            if expected is None:
                self._redirect(next_path)
                return
            ok_user = hmac.compare_digest(user.strip().encode("utf-8"), username.encode("utf-8"))
            ok_pass = hmac.compare_digest(given.encode("utf-8"), password.encode("utf-8"))
            if not (ok_user and ok_pass):
                time.sleep(1)  # slows down password guessing
                self._redirect("/login?error=1&next=" + quote(next_path, safe=""))
                return
            now = time.time()
            for token in [t for t, expiry in sessions.items() if expiry <= now]:
                del sessions[token]
            token = secrets.token_urlsafe(32)
            sessions[token] = now + SESSION_SECONDS
            cookie = f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_SECONDS}"
            if self._https():
                cookie += "; Secure"
            self._redirect(next_path, cookie)

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; connect-src 'self'; "
                "img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
            )
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self._send(status, body, "application/json; charset=utf-8")

        def do_GET(self) -> None:
            path, _, query = self.path.partition("?")
            if path == "/login":
                params = parse_qs(query)
                next_path = params.get("next", ["/"])[0]
                if expected is None or self._logged_in():
                    self._redirect(_safe_next(next_path))
                else:
                    self._login_page("error" in params, next_path)
                return
            if path == "/logout":
                sessions.pop(self._session_token() or "", None)
                self._redirect("/login", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
                return
            login_assets = {"/static/style.css", "/static/login.js", "/static/login-bg.jpg"}  # needed before sign-in
            if path not in login_assets and not self._authorized():
                return
            if path == "/dataset":  # the indexed RAGBench rows, as an Excel download
                data_file = STATIC_DIR / "RAGBench_Indexed_Data_5_Domains.xlsx"
                try:
                    body = data_file.read_bytes()
                except OSError:
                    self._send_json(404, {"error": "Dataset file not found."})
                    return
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                self.send_header("Content-Disposition", f'attachment; filename="{data_file.name}"')
                self.send_header("Content-Length", str(len(body)))
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(body)
                return
            static_files = {
                "/": STATIC_DIR / "index.html",
                "/questions": STATIC_DIR / "questions.html",
                "/static/style.css": STATIC_DIR / "style.css",
                "/static/app.js": STATIC_DIR / "app.js",
                "/static/login.js": STATIC_DIR / "login.js",
                "/static/login-bg.jpg": STATIC_DIR / "login-bg.jpg",
            }
            file_path = static_files.get(path)  # "/?q=..." serves the page too
            if file_path is None:
                self._send_json(404, {"error": "Not found."})
                return

            try:
                body = file_path.read_bytes()
            except OSError:
                LOGGER.exception("Unable to read web asset: %s", file_path.name)
                self._send_json(500, {"error": "Unable to load the chat interface."})
                return

            content_type = mimetypes.guess_type(file_path.name)[0]
            if content_type is None:
                content_type = "application/octet-stream"
            if content_type.startswith("text/") or content_type.endswith("javascript"):
                content_type += "; charset=utf-8"
            self._send(200, body, content_type)

        def do_POST(self) -> None:
            if self.path == "/login":
                self._handle_login()
                return
            if not self._authorized():
                return
            if self.path != "/api/chat":
                self._send_json(404, {"error": "Not found."})
                return

            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send_json(400, {"error": "Invalid request length."})
                return

            if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
                self._send_json(413, {"error": "Request is empty or too large."})
                return

            try:
                payload = json.loads(self.rfile.read(content_length))
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._send_json(400, {"error": "Request body must be valid JSON."})
                return

            if not isinstance(payload, dict):
                self._send_json(400, {"error": "Request body must be a JSON object."})
                return

            question = payload.get("question")
            if (
                not isinstance(question, str)
                or not question.strip()
                or len(question) > 4_000
            ):
                self._send_json(
                    400,
                    {"error": "Enter a question of 1 to 4,000 characters."},
                )
                return

            # One search box: the Router Agent finds the domain, a named contract and any
            # medication names in the question itself.
            try:
                result = assistant.invoke(
                    {"question": question.strip(), "user_medications": [], "document": ""}
                )
            except Exception:
                LOGGER.exception("Assistant request failed.")
                self._send_json(
                    502,
                    {
                        "error": (
                            "The assistant could not complete the request. "
                            "Check the server console and try again."
                        )
                    },
                )
                return

            self._send_json(200, _serialize_result(result))

        def log_message(self, format: str, *args: object) -> None:
            LOGGER.info("%s - %s", self.address_string(), format % args)

    return AssistantChatHandler


def main() -> None:
    global DISCLAIMER
    parser = argparse.ArgumentParser(
        description="Run the local multi-domain RAG chat interface (v2.9 notebook pipeline)."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--notebook", type=Path, default=DEFAULT_NOTEBOOK, help="The v2.9 Colab notebook to load.")
    parser.add_argument(
        "--persist-dir",
        default=str(PROJECT_DIR / "chroma_multidomain"),
        help="Chroma index folder (built on first run, reused afterwards); '' keeps the index in memory.",
    )
    args = parser.parse_args()
    if not 1 <= args.port <= 65_535:
        parser.error("--port must be between 1 and 65535.")

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    assistant, notebook = build_assistant(args.notebook, args.persist_dir or None)
    DISCLAIMER = notebook["DISCLAIMER"]
    login_user = os.environ.get("APP_USER") or "iith"
    # Default backlog is 5: a burst of users (e.g. after a QR scan) got connections refused.
    ThreadingHTTPServer.request_queue_size = 128
    server = ThreadingHTTPServer(
        (args.host, args.port),
        create_handler(assistant, os.environ.get("APP_PASSWORD") or None, login_user),
    )
    print(f"Multi-domain RAG chat available at http://{args.host}:{args.port}")
    if os.environ.get("APP_PASSWORD"):
        print(f"Login required at /login (user '{login_user}', password from APP_PASSWORD).")
    print("Research prototype only. Keep the server bound to localhost.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping web server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
