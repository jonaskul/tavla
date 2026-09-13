# Backend only. The frontend is a static bundle and belongs on a CDN
# (Cloudflare Pages), not in this image.
FROM python:3.11-slim

# psycopg[binary] ships its own libpq, so no build toolchain is needed.
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Migrations run before the server accepts traffic. Doing it here rather
# than in the app's startup means two instances rolling out at once cannot
# race each other into a half-migrated schema — the platform runs this as a
# release step, once.
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
