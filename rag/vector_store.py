"""ChromaDB vector store setup and management"""
import os
import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

load_dotenv()

# Initialize ChromaDB client
chroma_client = chromadb.Client(Settings(
    chroma_db_impl="duckdb+parquet",
    persist_directory="./rag/chroma_db"
))

# Collection for UAE tax law documents
tax_law_collection = chroma_client.get_or_create_collection(
    name="uae_tax_laws",
    metadata={"description": "UAE VAT, Corporate Tax, and regulatory documents"}
)


def add_document(text: str, metadata: dict, document_id: str = None):
    """Add a document to the vector store"""
    tax_law_collection.add(
        documents=[text],
        metadatas=[metadata],
        ids=[document_id] if document_id else None
    )


def query_documents(query: str, n_results: int = 5):
    """Query the vector store for relevant documents"""
    results = tax_law_collection.query(
        query_texts=[query],
        n_results=n_results
    )
    return results


def get_collection():
    """Get the tax law collection"""
    return tax_law_collection
