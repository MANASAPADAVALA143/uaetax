"""Database configuration and session management"""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Load backend/.env regardless of process cwd (e.g. uvicorn run from repo root).
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/gulftax_ai")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
