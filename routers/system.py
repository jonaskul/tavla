"""System status and update management."""
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

BASE_DIR = Path(os.getenv("TAVLA_DIR", str(Path(__file__).resolve().parent.parent)))

# Use the same Python / pip that runs the server.
# Outside a venv (PEP 668 systems) we need --break-system-packages.
_IN_VENV = sys.prefix != sys.base_prefix
_PIP_CMD = [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
if not _IN_VENV:
    _PIP_CMD.append("--break-system-packages")
_ALEMBIC_CMD = [sys.executable, "-m", "alembic", "upgrade", "head"]


def _run(*args, timeout=30, cwd=None):
    """Run a command, return (returncode, combined_output)."""
    result = subprocess.run(
        list(args),
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=str(cwd or BASE_DIR),
    )
    return result.returncode, (result.stdout + result.stderr).strip()


def _is_systemd_managed() -> bool:
    """True if tavla-backend is an active systemd service (production)."""
    rc, _ = _run("systemctl", "is-active", "tavla-backend", timeout=3)
    return rc == 0


def _upstream() -> str:
    """Return the remote-tracking ref for the current branch (e.g. origin/feature/fase4)."""
    rc, ref = _run("git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", timeout=5)
    if rc == 0 and ref.strip():
        return ref.strip()
    _, branch = _run("git", "rev-parse", "--abbrev-ref", "HEAD", timeout=5)
    return f"origin/{branch.strip()}"


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
def get_status():
    _, commit = _run("git", "rev-parse", "--short", "HEAD")
    _, branch = _run("git", "rev-parse", "--abbrev-ref", "HEAD")
    _, log_line = _run("git", "log", "-1", "--format=%cd|%s", "--date=format-local:%Y-%m-%d %H:%M")
    date, _, message = log_line.partition("|")
    return {
        "current_commit": commit,
        "current_branch": branch,
        "commit_date": date.strip(),
        "commit_message": message.strip(),
    }


# ── Check for updates ─────────────────────────────────────────────────────────

@router.get("/check-update")
def check_update():
    rc, out = _run("git", "fetch", "origin", timeout=15)
    if rc != 0:
        raise HTTPException(status_code=503, detail=out or "Kunne ikke nå GitHub")

    _, log = _run("git", "log", f"HEAD..{_upstream()}", "--format=%h|%s|%ci")

    commits = []
    for line in log.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 2)
        commits.append({
            "hash": parts[0] if len(parts) > 0 else "",
            "message": parts[1] if len(parts) > 1 else "",
            "date": parts[2].strip() if len(parts) > 2 else "",
        })

    return {
        "updates_available": bool(commits),
        "commits_behind": len(commits),
        "changelog": commits,
    }


@router.get("/pending")
def get_pending():
    """Fast local check using last-fetched state — no network call."""
    _, log = _run("git", "log", f"HEAD..{_upstream()}", "--oneline")
    count = sum(1 for l in log.splitlines() if l.strip())
    return {"updates_available": count > 0}


# ── Update ────────────────────────────────────────────────────────────────────

@router.post("/update")
def trigger_update():
    return {"ok": True}


_UPDATE_STEPS = [
    ("fetching",     ["git", "fetch", "origin"]),
    ("pulling",      ["git", "pull"]),
    ("dependencies", _PIP_CMD),
    ("frontend",     ["npm", "run", "build", "--prefix", "frontend"]),
    ("migrations",   _ALEMBIC_CMD),
    ("restarting",   ["systemctl", "restart", "tavla-backend"]),
]


async def _stream_update():
    def emit(step: str, status: str, output: str = "", dev_mode: bool = False) -> str:
        d: dict = {"step": step, "status": status, "output": output}
        if dev_mode:
            d["dev_mode"] = True
        return f"data: {json.dumps(d)}\n\n"

    loop = asyncio.get_event_loop()

    for step_name, cmd in _UPDATE_STEPS:
        if step_name == "restarting" and not _is_systemd_managed():
            yield emit(step_name, "done",
                       "Restart ikke nødvendig i utviklingsmodus", dev_mode=True)
            continue

        yield emit(step_name, "running")

        try:
            result = await loop.run_in_executor(
                None,
                lambda c=cmd: subprocess.run(
                    c,
                    capture_output=True,
                    text=True,
                    timeout=300,
                    cwd=str(BASE_DIR),
                ),
            )
            output = (result.stdout + result.stderr).strip()
            if result.returncode != 0:
                yield emit(step_name, "error", output)
                return
            yield emit(step_name, "done", output)
        except subprocess.TimeoutExpired:
            yield emit(step_name, "error", "Kommando tidsavbrutt etter 300 sekunder")
            return
        except Exception as exc:
            yield emit(step_name, "error", str(exc))
            return


@router.get("/update/stream")
async def update_stream():
    return StreamingResponse(
        _stream_update(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
