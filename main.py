from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database import create_db_and_tables, engine
from routers import properties, panels, circuits, connection_points, equipment, files, export, changelog, modules, channels, module_types, system
from routers.files import UPLOAD_DIR
from routers.module_types import seed_builtin_types
from tenancy import bootstrap_single_user_install, guard_request
from sqlmodel import Session


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with Session(engine) as session:
        bootstrap_single_user_install(session)
        seed_builtin_types(session)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="Tavla API",
    description="Electrical installation documentation for Norwegian homes",
    version="0.1.0",
    lifespan=lifespan,
    # Runs on every request: binds the acting organization so the flush
    # listener in tenancy.py can stamp new rows, and refuses anything that
    # needs a tenant without one. App-level rather than middleware so it
    # resolves through the injected session, which tests override, and so a
    # new endpoint is protected by default instead of by remembering to.
    dependencies=[Depends(guard_request)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(properties.router, prefix="/api/properties", tags=["properties"])
app.include_router(panels.router, prefix="/api/panels", tags=["panels"])
app.include_router(circuits.router, prefix="/api/circuits", tags=["circuits"])
app.include_router(connection_points.router, prefix="/api/connection_points", tags=["connection_points"])
app.include_router(equipment.router, prefix="/api/equipment", tags=["equipment"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(changelog.router, prefix="/api/changelog", tags=["changelog"])
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])
app.include_router(channels.router, prefix="/api/channels", tags=["channels"])
app.include_router(module_types.router, prefix="/api/module_types", tags=["module_types"])
app.include_router(system.router, prefix="/api/system", tags=["system"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
