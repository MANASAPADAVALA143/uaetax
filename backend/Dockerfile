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

# Pre-download the sentence-transformers model at build time
# so container startup is instant (no network download on boot)
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

# Copy application code
COPY . .

# Make startup script executable
RUN chmod +x start.sh

# Expose port (Render injects $PORT at runtime)
EXPOSE 8000

# Run migrations then start server via startup script
CMD ["./start.sh"]
