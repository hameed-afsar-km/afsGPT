"""
vector.py — Document ingestion and ChromaDB vector store management.
Supports PDF, TXT, CSV, and XLSX file types.
"""

import os
import sys

# Workaround for ChromaDB on Linux/Render (outdated system sqlite)
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import gc
import csv
from typing import Optional
try:
    from langchain_chroma import Chroma
except ImportError:
    try:
        from langchain.vectorstores import Chroma
    except ImportError:
        Chroma = None
try:
    from langchain_ollama import OllamaEmbeddings
except ImportError:
    OllamaEmbeddings = None
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ─── Config ───────────────────────────────────────────────────────────────────
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
EMBED_MODEL = "all-minilm"                # pull with: ollama pull all-minilm
CHUNK_SIZE  = 5000
CHUNK_OVERLAP = 500

# ─── Caches ───────────────────────────────────────────────────────────────────
_embedding_cache: dict = {}
_retriever_cache: dict = {}

def _get_embedding_key(api_key: Optional[str] = None) -> str:
    google_key = api_key or os.environ.get("GOOGLE_API_KEY")
    return f"google:{google_key}" if google_key else "ollama"

def _ensure_ollama_model(model: str) -> None:
    """Check if an Ollama model is available; pull it if not."""
    import requests as req
    OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    try:
        resp = req.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        if resp.ok:
            installed = [m["name"] for m in resp.json().get("models", [])]
            # Ollama may return "all-minilm:latest" or "all-minilm"
            if any(model in m for m in installed):
                return
        # Model not found — pull it
        import logging
        log = logging.getLogger(__name__)
        log.info(f"Ollama model '{model}' not found. Pulling (this may take a moment)...")
        pull_resp = req.post(f"{OLLAMA_HOST}/api/pull", json={"name": model}, timeout=300)
        if pull_resp.ok:
            log.info(f"Successfully pulled Ollama model '{model}'.")
        else:
            log.warning(f"Failed to pull '{model}': {pull_resp.status_code} {pull_resp.text}")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Could not verify/pull Ollama model '{model}': {e}")

def get_embeddings(api_key: Optional[str] = None):
    """Dynamically choose embeddings based on available keys. Cached."""
    key = _get_embedding_key(api_key)
    if key in _embedding_cache:
        return _embedding_cache[key]
    google_key = api_key or os.environ.get("GOOGLE_API_KEY")
    if google_key:
        emb = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=google_key)
    else:
        _ensure_ollama_model(EMBED_MODEL)
        emb = OllamaEmbeddings(model=EMBED_MODEL)
    _embedding_cache[key] = emb
    return emb


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
    except Exception as e:
        raise ValueError(f"Failed to read PDF file: {e}")


def _load_csv(path: str) -> list[Document]:
    text_lines = []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        for row in reader:
            text_lines.append(", ".join(row))
    text = "\n".join(text_lines)
    return [Document(page_content=text, metadata={"source": os.path.basename(path)})]


def _load_xlsx(path: str) -> list[Document]:
    # Placeholder: Removing pandas/openpyxl to save memory on Render Free Tier
    return [Document(page_content="Excel processing disabled to save memory.", metadata={"source": os.path.basename(path)})]


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

def ingest_file(path: str, collection_name: str = "rag_store", api_key: Optional[str] = None) -> Chroma:
    """
    Load, chunk, embed, and persist a file into ChromaDB.
    Returns the Chroma vector store.
    """
    import logging
    log = logging.getLogger(__name__)
    log.info(f"[{collection_name}] Loading file: {path}")
    docs   = load_file(path)
    # Ensure there is actually some text in the documents
    docs = [d for d in docs if d.page_content.strip()]
    
    if not docs:
        raise ValueError("The uploaded file contains no readable text. It might be a scanned image or empty.")
        
    chunks = _split(docs)
    if not chunks:
        # Fallback: Use the original documents if they couldn't be split
        chunks = docs

    log.info(f"[{collection_name}] Loaded {len(docs)} page(s), split into {len(chunks)} chunk(s). Embedding with {_get_embedding_key(api_key)}...")
    db = Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings(api_key),
        persist_directory=CHROMA_DIR,
    )
    db.add_documents(chunks)
    log.info(f"[{collection_name}] Ingestion complete — {len(chunks)} chunks persisted to ChromaDB.")
    gc.collect() # Force cleanup
    return db


def get_retriever(collection_name: str = "rag_store", k: int = 5, api_key: Optional[str] = None):
    """Return a retriever over an existing ChromaDB collection. Cached per collection."""
    cache_key = f"{collection_name}:{_get_embedding_key(api_key)}:{k}"
    if cache_key in _retriever_cache:
        return _retriever_cache[cache_key]
    db = Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings(api_key),
        persist_directory=CHROMA_DIR,
    )
    retriever = db.as_retriever(search_kwargs={"k": k})
    _retriever_cache[cache_key] = retriever
    return retriever


def clear_collection(collection_name: str = "rag_store"):
    """Wipe all documents from a collection (fresh session)."""
    # Invalidate cache for this collection
    keys_to_remove = [k for k in _retriever_cache if k.startswith(f"{collection_name}:")]
    for k in keys_to_remove:
        del _retriever_cache[k]
    db = Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings(), # Default is fine for deletion
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

