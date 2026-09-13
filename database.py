from sqlmodel import SQLModel, create_engine, Session

from config import DATABASE_URL

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
