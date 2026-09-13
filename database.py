import os

from sqlmodel import SQLModel, create_engine, Session

# SQLite stays the default so a local checkout runs with no services to start.
# Production sets DATABASE_URL to PostgreSQL, which is what row-level security
# needs — it is the only place tenant isolation cannot be bypassed by a query
# that forgot its WHERE clause.
#
#   postgresql+psycopg://user:password@host:5432/tavla
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tavla.db")

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # check_same_thread is a SQLite-only setting and errors on other drivers.
    _connect_args = {"check_same_thread": False}
    _engine_kwargs = {}
else:
    _connect_args = {}
    # Managed PostgreSQL (Neon, Supabase) drops idle connections; without
    # pre-ping the pool hands out dead ones and the request fails.
    _engine_kwargs = {"pool_pre_ping": True, "pool_recycle": 300}

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    echo=False,
    **_engine_kwargs,
)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
