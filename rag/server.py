"""
server.py — FastAPI backend for the drag-and-drop RAG system.

Endpoints:
  POST /upload  — Accept a file, ingest it into ChromaDB, return session_id
  POST /query   — Answer a question using the stored collection
  DELETE /clear — Wipe a collection (start fresh)
  GET  /        — Serve the frontend UI
"""

import os
import sys
import uuid
import shutil
import logging

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

# Allow sibling imports (vector, rag_chain live in same dir)
sys.path.insert(0, os.path.dirname(__file__))

from vector import ingest_file, clear_collection
from rag_chain import query

# ─── App setup ────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="AfsGPT RAG API", version="1.0.0")

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".txt", ".pdf", ".csv", ".xlsx", ".xls"}

# ─── Models ───────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    session_id: str
    question:   str

class ClearRequest(BaseModel):
    session_id: str

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), session_id: Optional[str] = Form(None)):
    """
    Receive an uploaded file, save it temporarily,
    ingest into a unique ChromaDB collection, return a session_id.
    """
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXT)}"
        )

    if not session_id:
        session_id  = str(uuid.uuid4())
    save_path   = os.path.join(UPLOAD_DIR, f"{session_id}_{file.filename}")

    # Save uploaded file to disk
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    log.info(f"[{session_id}] Saved '{file.filename}' → '{save_path}'")

    try:
        ingest_file(path=save_path, collection_name=session_id)
        log.info(f"[{session_id}] Ingested '{file.filename}' into ChromaDB.")
    except Exception as e:
        log.error(f"[{session_id}] Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Ingestion error: {str(e)}")
    finally:
        # Remove temp file after ingestion
        if os.path.exists(save_path):
            os.remove(save_path)

    return JSONResponse({
        "session_id": session_id,
        "filename":   file.filename,
        "message":    "File ingested successfully. You can now ask questions."
    })


@app.post("/query")
async def ask_question(body: QueryRequest):
    """Answer a question using the documents in a given session collection."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    log.info(f"[{body.session_id}] Question: {body.question}")
    try:
        answer = query(question=body.question, collection_name=body.session_id)
        log.info(f"[{body.session_id}] Answer generated.")
    except Exception as e:
        log.error(f"[{body.session_id}] Query error: {e}")
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

    return JSONResponse({"answer": answer})


@app.delete("/clear")
async def clear_session(body: ClearRequest):
    """Delete all documents in a session collection."""
    try:
        clear_collection(collection_name=body.session_id)
        log.info(f"[{body.session_id}] Collection cleared.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse({"message": "Session cleared."})


# ─── Static frontend ──────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_ui():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
