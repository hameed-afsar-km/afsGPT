"""
vector.py — Document ingestion and ChromaDB vector store management.
Supports PDF, TXT, CSV, and XLSX file types.
"""

import os
import pandas as pd
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ─── Config ───────────────────────────────────────────────────────────────────
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
EMBED_MODEL = "nomic-embed-text"          # pull with: ollama pull nomic-embed-text
CHUNK_SIZE  = 1000
CHUNK_OVERLAP = 150

embeddings = OllamaEmbeddings(model=EMBED_MODEL)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _split(docs: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    return splitter.split_documents(docs)


def _load_txt(path: str) -> list[Document]:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    return [Document(page_content=text, metadata={"source": os.path.basename(path)})]


def _load_pdf(path: str) -> list[Document]:
    try:
        from langchain_community.document_loaders import PyPDFLoader
        loader = PyPDFLoader(path)
        return loader.load()
    except ImportError:
        raise ImportError("Install pypdf: pip install pypdf langchain-community")


def _load_csv(path: str) -> list[Document]:
    df = pd.read_csv(path)
    text = df.to_string(index=False)
    return [Document(page_content=text, metadata={"source": os.path.basename(path)})]


def _load_xlsx(path: str) -> list[Document]:
    df = pd.read_excel(path)
    text = df.to_string(index=False)
    return [Document(page_content=text, metadata={"source": os.path.basename(path)})]


def load_file(path: str) -> list[Document]:
    """Detect file type and return a list of Documents."""
    ext = os.path.splitext(path)[-1].lower()
    loaders = {
        ".txt":  _load_txt,
        ".pdf":  _load_pdf,
        ".csv":  _load_csv,
        ".xlsx": _load_xlsx,
        ".xls":  _load_xlsx,
    }
    if ext not in loaders:
        raise ValueError(f"Unsupported file type: {ext}")
    return loaders[ext](path)


# ─── Public API ───────────────────────────────────────────────────────────────

def ingest_file(path: str, collection_name: str = "rag_store") -> Chroma:
    """
    Load, chunk, embed, and persist a file into ChromaDB.
    Returns the Chroma vector store.
    """
    docs   = load_file(path)
    chunks = _split(docs)

    db = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )
    db.add_documents(chunks)
    return db


def get_retriever(collection_name: str = "rag_store", k: int = 5):
    """Return a retriever over an existing ChromaDB collection."""
    db = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )
    return db.as_retriever(search_kwargs={"k": k})


def clear_collection(collection_name: str = "rag_store"):
    """Wipe all documents from a collection (fresh session)."""
    db = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )
    db.delete_collection()

def clear_all_collections():
    """Wipe all documents from all collections."""
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_DIR)
        collections = client.list_collections()
        for col in collections:
            client.delete_collection(col.name)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to clear all collections via API: {e}")
        # Fallback: remove the directory
        import shutil
        if os.path.exists(CHROMA_DIR):
            shutil.rmtree(CHROMA_DIR, ignore_errors=True)

