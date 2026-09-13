#!/usr/bin/env python3
"""Regenerate contract/endpoints.json from the FastAPI app.

Run this only when an endpoint is deliberately added or removed. The file is
the frozen contract the rewrite is measured against, so it changing by
accident would quietly move the target.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from main import app  # noqa: E402

spec = app.openapi()
rows = sorted(
    (
        {"method": method.upper(), "path": path}
        for path, ops in spec["paths"].items()
        for method in ops
        if method.upper() in ("GET", "POST", "PUT", "DELETE", "PATCH")
    ),
    key=lambda r: (r["path"], r["method"]),
)

target = pathlib.Path(__file__).parent / "endpoints.json"
doc = json.loads(target.read_text())
before = {(e["method"], e["path"]) for e in doc["endpoints"]}
after = {(r["method"], r["path"]) for r in rows}

doc["endpoints"] = rows
target.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")

for gone in sorted(before - after):
    print(f"  fjernet: {gone[0]} {gone[1]}")
for added in sorted(after - before):
    print(f"  lagt til: {added[0]} {added[1]}")
print(f"{len(rows)} endepunkter")
