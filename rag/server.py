"""
server.py — FastAPI backend for the RAG & Image Generation system.

Endpoints:
  POST /upload              — Accept a file, ingest it into ChromaDB, return session_id
  POST /query               — Answer a question using the stored collection
  DELETE /clear             — Wipe a collection (start fresh)
  POST /api/generate-image  — Generate an image via FLUX.1-dev (Qwen-enhanced prompt)
  GET  /static/images/*     — Serve generated images
"""

import os
import sys
import uuid
import shutil
import logging
import base64
import ollama

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Allow sibling imports (vector, rag_chain live in same dir)
sys.path.insert(0, os.path.dirname(__file__))

from vector import ingest_file, clear_collection, clear_all_collections
from rag_chain import query
from image_gen import generate_image
from research_agent import run_research

# ─── App setup ────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="AfsGPT RAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
IMAGES_DIR = os.path.join(STATIC_DIR, "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

ALLOWED_EXT = {".txt", ".pdf", ".csv", ".xlsx", ".xls"}

# ─── Models ───────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    session_id: str
    question:   str

class ClearRequest(BaseModel):
    session_id: str

class ImageGenRequest(BaseModel):
    prompt: str

class ImageAnalyzeRequest(BaseModel):
    image_base64: str
    question: str = "Describe this image in detail."

class ResearchRequest(BaseModel):
    query: str
    provider: str = "ollama"
    model: str = "gemma2:2b"
    api_key: str = ""

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/upload")
def upload_file(file: UploadFile = File(...), session_id: Optional[str] = Form(None)):
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
def ask_question(body: QueryRequest):
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


@app.post("/api/generate-image")
async def create_image(body: ImageGenRequest):
    """Generates an image via FLUX.1 using Qwen-enhanced prompt."""
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")
    
    result = generate_image(body.prompt, IMAGES_DIR)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return JSONResponse(result)


@app.delete("/clear")
async def clear_session(body: ClearRequest):
    """Delete all documents in a session collection."""
    try:
        clear_collection(collection_name=body.session_id)
        log.info(f"[{body.session_id}] Collection cleared.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse({"message": "Session cleared."})


@app.post("/api/research")
async def research_query(body: ResearchRequest):
    """
    Run the multi-step Research Agent:
      1. Planner   — breaks query into sub-questions
      2. Searcher  — DuckDuckGo search for each sub-question
      3. Synthesizer — combines findings into a structured Markdown answer
    """
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    log.info(f"[Research] Starting research for: {body.query[:80]}")
    try:
        answer = run_research(
            query=body.query,
            provider=body.provider,
            model=body.model,
            api_key=body.api_key,
        )
        return JSONResponse({"answer": answer})
    except Exception as e:
        log.error(f"[Research] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Research agent error: {str(e)}")


@app.post("/analyze-image")
def analyze_image(body: ImageAnalyzeRequest):
    """Analyze an image using LLaVA via Ollama."""
    if not body.image_base64.strip():
        raise HTTPException(status_code=400, detail="Image data cannot be empty.")

    try:
        log.info(f"Received image analysis request. Question: {body.question[:50]}...")
        
        # Pass the raw base64 string directly to Ollama
        # Ollama supports direct base64 strings in the images array
        header, _, data = body.image_base64.partition(",")
        clean_base64 = data if data else body.image_base64

        log.info(f"Calling Ollama with model moondream... (Image size: {len(clean_base64)} chars)")
        
        response = ollama.chat(
            model="moondream",
            messages=[
                {
                    "role": "user",
                    "content": body.question,
                    "images": [clean_base64]
                }
            ],
            options={
                "temperature": 0.2,
            }
        )

        if "message" in response and "content" in response["message"]:
            answer = response["message"]["content"]
            log.info("LLaVA analysis completed successfully.")
            return JSONResponse({"answer": answer})
        else:
            log.error(f"Unexpected response from Ollama: {response}")
            raise HTTPException(status_code=500, detail="Ollama returned an empty or malformed response.")

    except Exception as e:
        error_str = str(e)
        log.error(f"LLaVA analysis error: {error_str}")
        if "png: invalid format" in error_str:
            raise HTTPException(status_code=400, detail="The image format is invalid or too small for the model to process.")
        raise HTTPException(status_code=500, detail=f"Ollama Error: {error_str}")


@app.delete("/clear-all")
async def clear_all_sessions():
    """Delete all documents in all collections."""
    try:
        clear_all_collections()
        log.info("All collections cleared.")
        
        # Also clean up the uploads directory just in case
        for f in os.listdir(UPLOAD_DIR):
            file_path = os.path.join(UPLOAD_DIR, f)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
            except Exception as e:
                log.error(f"Failed to delete {file_path}: {e}")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse({"message": "All files cleared."})


# ─── Static frontend ──────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_ui():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
