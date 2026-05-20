FROM python:3.12-slim

# Install system dependencies needed by psycopg2 + sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Railway injects $PORT at runtime)
EXPOSE 8000

# Run migrations then start server
CMD alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
