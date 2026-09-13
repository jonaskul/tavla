"""Startup configuration.

A misconfigured deployment must fail loudly. The failures these guard
against are the quiet kind: sessions that reset on every restart because no
secret was set, sign-in codes written to a log instead of sent, a browser
that cannot reach the API because no origin was allowed, or — worst —
authentication switched off on something reachable from the internet.

config is re-imported per test because it reads the environment once, at
import, which is what makes it a snapshot of how this process was started.
"""

import importlib

import pytest


@pytest.fixture(autouse=True)
def restore_config():
    """Put config back as the process started it.

    Reloading mutates the module in place, so without this every test that
    runs afterwards inherits the environment the last case here set up —
    production origins, a session secret, whichever cookie flags. That
    leaked into the sign-in tests and cost an afternoon.
    """
    yield
    import config
    importlib.reload(config)


def load(monkeypatch, **env):
    for key in (
        "TAVLA_ENV", "DATABASE_URL", "CORS_ORIGINS", "SESSION_SECRET",
        "RESEND_API_KEY", "AUTH_FROM_EMAIL", "AUTH_MODE",
        "COOKIE_SECURE", "COOKIE_SAMESITE", "COOKIE_DOMAIN",
        "R2_BUCKET", "R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    import config
    return importlib.reload(config)


PRODUCTION = dict(
    TAVLA_ENV="production",
    DATABASE_URL="postgresql+psycopg://u:p@h/db",
    SESSION_SECRET="x" * 40,
    CORS_ORIGINS="https://app.tavla.no",
    RESEND_API_KEY="re_test",
    AUTH_FROM_EMAIL="innlogging@tavla.no",
    R2_BUCKET="tavla-filer",
    R2_ENDPOINT_URL="https://x.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID="nokkel",
    R2_SECRET_ACCESS_KEY="hemmelig",
)


def test_a_complete_production_config_starts_clean(monkeypatch):
    cfg = load(monkeypatch, **PRODUCTION)
    assert cfg.validate() == []
    assert cfg.IS_PRODUCTION


@pytest.mark.parametrize(
    "missing",
    ["SESSION_SECRET", "RESEND_API_KEY", "AUTH_FROM_EMAIL"],
)
def test_production_refuses_to_start_without(monkeypatch, missing):
    env = {k: v for k, v in PRODUCTION.items() if k != missing}
    cfg = load(monkeypatch, **env)
    with pytest.raises(cfg.ConfigError, match=missing):
        cfg.validate()


def test_development_only_warns(monkeypatch):
    """A plain checkout has to run with nothing configured at all."""
    cfg = load(monkeypatch)
    warnings = cfg.validate()
    assert warnings, "silence would hide that sessions reset on restart"
    assert any("SESSION_SECRET" in w for w in warnings)
    assert cfg.CORS_ORIGINS == ["http://localhost:5173"]


def test_production_on_sqlite_warns_about_isolation(monkeypatch):
    """SQLite has no row-level security, so isolation is application-only."""
    cfg = load(monkeypatch, **{**PRODUCTION, "DATABASE_URL": "sqlite:///./tavla.db"})
    assert any("SQLite" in w for w in cfg.validate())


def test_production_with_authentication_off_warns_loudly(monkeypatch):
    cfg = load(monkeypatch, **{**PRODUCTION, "AUTH_MODE": "single_user"})
    assert any("single_user" in w for w in cfg.validate())


def test_single_user_production_does_not_need_email(monkeypatch):
    """Nobody signs in, so the sign-in mail configuration is irrelevant."""
    env = {k: v for k, v in PRODUCTION.items()
           if k not in ("RESEND_API_KEY", "AUTH_FROM_EMAIL")}
    cfg = load(monkeypatch, **env, AUTH_MODE="single_user")
    cfg.validate()  # warns, does not raise


def test_samesite_none_without_secure_is_refused(monkeypatch):
    """Browsers reject that combination, so starting would be pointless."""
    cfg = load(monkeypatch, **PRODUCTION, COOKIE_SAMESITE="none", COOKIE_SECURE="0")
    with pytest.raises(cfg.ConfigError, match="COOKIE_SECURE"):
        cfg.validate()


def test_cors_origins_are_split_and_trimmed(monkeypatch):
    cfg = load(
        monkeypatch,
        **{**PRODUCTION, "CORS_ORIGINS": "https://a.no , https://b.no"},
    )
    assert cfg.CORS_ORIGINS == ["https://a.no", "https://b.no"]


def test_production_has_no_default_origin(monkeypatch):
    """The Vite dev origin must not leak into a production deployment."""
    env = {k: v for k, v in PRODUCTION.items() if k != "CORS_ORIGINS"}
    cfg = load(monkeypatch, **env)
    assert cfg.CORS_ORIGINS == []


def test_no_origins_is_allowed_but_noted(monkeypatch):
    """Serving the API under the frontend's own origin needs no CORS at all.

    Requiring it would have blocked the simplest deployment there is.
    """
    env = {k: v for k, v in PRODUCTION.items() if k != "CORS_ORIGINS"}
    cfg = load(monkeypatch, **env)
    warnings = cfg.validate()  # must not raise
    assert any("CORS_ORIGINS" in w for w in warnings)


def test_authentication_is_on_unless_explicitly_turned_off(monkeypatch):
    """A deployment that configures nothing has to end up closed."""
    cfg = load(monkeypatch)
    assert not cfg.SINGLE_USER_MODE
    assert cfg.AUTH_MODE == "session"


def test_the_session_secret_is_used_when_set(monkeypatch):
    cfg = load(monkeypatch, **PRODUCTION)
    assert cfg.session_secret_bytes() == PRODUCTION["SESSION_SECRET"].encode()


def test_an_ephemeral_secret_is_stable_within_a_process(monkeypatch):
    """Otherwise a code would stop working between being sent and entered."""
    cfg = load(monkeypatch)
    assert cfg.session_secret_bytes() == cfg.session_secret_bytes()


def test_local_file_storage_in_production_warns(monkeypatch):
    """Uploads on local disk tie the deployment to one machine.

    On anything that can reschedule the instance the rows survive and the
    photographs do not, which is silent data loss rather than an outage.
    """
    env = {k: v for k, v in PRODUCTION.items() if not k.startswith("R2_")}
    cfg = load(monkeypatch, **env)
    assert any("R2_BUCKET" in w for w in cfg.validate())


@pytest.mark.parametrize(
    "missing", ["R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
)
def test_half_configured_r2_refuses_to_start(monkeypatch, missing):
    """Half-configured storage would fail on the first upload, not at boot."""
    env = {k: v for k, v in PRODUCTION.items() if k != missing}
    cfg = load(monkeypatch, **env)
    with pytest.raises(cfg.ConfigError, match=missing):
        cfg.validate()
