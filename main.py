from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database import create_db_and_tables
from routers import properties, panels, circuits, connection_points, equipment, files, export, changelog, modules, channels


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    os.makedirs("../uploads", exist_ok=True)
    yield


app = FastAPI(
    title="Tavla API",
    description="Electrical installation documentation for Norwegian homes",
    version="0.1.0",
    lifespan=lifespan,
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


@app.get("/api/health")
def health():
    return {"status": "ok"}
