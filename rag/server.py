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
import base64
import logging
import re
import requests
import asyncio
import ollama
import google.generativeai as genai
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# New Google GenAI SDK for Direct PDF Analysis
try:
    from google import genai as new_genai
    from google.genai import types as genai_types
except ImportError:
    new_genai = None
import uvicorn

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
    apiKey: Optional[str] = None
    provider: Optional[str] = "gemini"
    model: Optional[str] = "gemini-1.5-flash"

class ClearRequest(BaseModel):
    session_id: str

class ImageGenRequest(BaseModel):
    prompt: str

class ImageAnalyzeRequest(BaseModel):
    image_base64: str
    question: str = "Describe this image in detail."
    apiKey: Optional[str] = None
    model: Optional[str] = "gemini-1.5-flash"
    provider: Optional[str] = "gemini"

class ResearchRequest(BaseModel):
    query: str
    provider: str = "ollama"
    model: str = "gemma2:2b"
    api_key: str = ""

class ChatRequest(BaseModel):
    messages: list
    provider: str
    model: str
    apiKey: Optional[str] = None

class ModelsRequest(BaseModel):
    provider: str
    apiKey: Optional[str] = None

@app.get("/health")
def health_check():
    """Returns the status and available routes of the backend."""
    return {
        "status": "online",
        "version": "1.1.0",
        "routes": [
            "/chat", "/models", "/research", "/analyze-image", 
            "/generate-image", "/upload", "/query", "/clear"
        ]
    }

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/upload")
def upload_file(
    file: UploadFile = File(...), 
    session_id: Optional[str] = Form(None),
    apiKey: Optional[str] = Form(None)
):
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
        ingest_file(path=save_path, collection_name=session_id, api_key=apiKey)
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
        "message":    "File received. Analysis mode: Cloud Direct (No-DB)." if ".pdf" in file.filename.lower() else "File ingested into database."
    })


async def direct_document_analysis(question: str, file_path: str, api_key: str, provider: str = "gemini", model_name: str = "gemini-1.5-flash"):
    """Sends the document directly to the selected AI for analysis (No-DB RAG)."""
    try:
        provider = provider.lower() if provider else "gemini"
        
        # --- Gemini Native PDF ---
        if provider == "gemini":
            if not new_genai:
                return "Cloud analysis failed: google-genai SDK not installed."
            client = new_genai.Client(api_key=api_key)
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()

            target_model = model_name if model_name else "gemini-1.5-flash"
            response = client.models.generate_content(
                model=target_model,
                contents=[
                    genai_types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
                    question
                ]
            )
            return response.text

        # --- Anthropic Native PDF ---
        if provider == "anthropic":
            with open(file_path, "rb") as f:
                pdf_b64 = base64.b64encode(f.read()).decode("utf-8")
            
            target_model = model_name if model_name else "claude-3-5-sonnet-20240620"
            payload = {
                "model": target_model,
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": pdf_b64
                                }
                            },
                            {
                                "type": "text",
                                "text": question
                            }
                        ]
                    }
                ]
            }
            res = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json=payload,
                timeout=120
            )
            if res.ok:
                return res.json()["content"][0]["text"]
            return f"Anthropic error: {res.text}"

        # --- OpenAI (In-Memory Text Extraction Fallback) ---
        if provider == "openai":
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(file_path)
            docs = loader.load()
            full_text = "\n".join([d.page_content for d in docs])
            
            target_model = model_name if model_name else "gpt-4o-mini"
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": f"Document Text:\n{full_text[:100000]}"}, # Truncate to avoid massive payloads
                    {"role": "user", "content": question}
                ],
                "max_tokens": 1000
            }
            res = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=120
            )
            if res.ok:
                return res.json()["choices"][0]["message"]["content"]
            return f"OpenAI error: {res.text}"
            
        return "Provider not supported for direct document analysis."

    except Exception as e:
        log.error(f"Direct Document Analysis failed: {e}")
        return f"Cloud analysis failed: {str(e)}"


@app.post("/query")
async def ask_question(body: QueryRequest):
    """Answer a question using the documents in a given session collection."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    log.info(f"[{body.session_id}] Question: {body.question}")
    
    # ─── New Direct Document Logic (Bypass DB for PDFs on Render) ───────────
    if body.apiKey and body.session_id:
        # Find the uploaded file for this session
        potential_files = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(body.session_id) and f.lower().endswith(".pdf")]
        if potential_files:
            file_path = os.path.join(UPLOAD_DIR, potential_files[0])
            log.info(f"[{body.session_id}] Using Direct Analysis Mode ({body.provider}) for {potential_files[0]}")
            answer = await direct_document_analysis(body.question, file_path, body.apiKey, body.provider, body.model)
            return JSONResponse({"answer": answer})

    # ─── Standard RAG Logic (Ollama / ChromaDB) ───────────────────────────
    try:
        # Pass apiKey to the RAG chain logic
        answer = query(question=body.question, collection_name=body.session_id, api_key=body.apiKey)
        log.info(f"[{body.session_id}] Answer generated.")
    except Exception as e:
        log.error(f"[{body.session_id}] Query error: {e}")
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

    return JSONResponse({"answer": answer})


@app.post("/generate-image")
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


@app.post("/research")
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
        
        header, _, data = body.image_base64.partition(",")
        clean_base64 = data if data else body.image_base64

        # ─── Strict Provider & Model Adherence ───────────────────────
        api_key = body.apiKey
        selected_provider = body.provider.lower() if body.provider else "gemini"
        
        errors = []

        # ─── Google Gemini ──────────────────────────────────────────
        if selected_provider == "gemini" and api_key:
            try:
                log.info(f"Attempting Gemini image analysis with {body.model}...")
                
                target_model = body.model if body.model else "gemini-1.5-flash"
                api_model = target_model

                # Use New SDK if available, else Old SDK
                if new_genai:
                    client = new_genai.Client(api_key=api_key)
                    img_data = base64.b64decode(clean_base64)
                    response = client.models.generate_content(
                        model=api_model,
                        contents=[
                            genai_types.Part.from_bytes(data=img_data, mime_type='image/jpeg'),
                            body.question
                        ]
                    )
                    if response.text:
                        return JSONResponse({"answer": response.text})
                else:
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel(api_model)
                    img_data = base64.b64decode(clean_base64)
                    response = model.generate_content([body.question, {'mime_type': 'image/jpeg', 'data': img_data}])
                    if response.text:
                        return JSONResponse({"answer": response.text})
            except Exception as e:
                err_msg = f"Gemini Error: {str(e)}"
                log.warning(err_msg)
                errors.append(err_msg)

        # ─── OpenAI GPT-4o ──────────────────────────────────────────
        if (selected_provider == "openai" or not selected_provider) and api_key:
            try:
                log.info("Attempting OpenAI (GPT-4o) image analysis...")
                api_model = body.model if body.model else "gpt-4o-mini"
                payload = {
                    "model": api_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": body.question},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{clean_base64}"}}
                            ]
                        }
                    ],
                    "max_tokens": 500
                }
                res = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=60
                )
                if res.ok:
                    return JSONResponse({"answer": res.json()["choices"][0]["message"]["content"]})
                else:
                    err_msg = f"OpenAI API Error: {res.text}"
                    log.error(err_msg)
                    errors.append(err_msg)
            except Exception as e:
                err_msg = f"OpenAI Exception: {str(e)}"
                log.warning(err_msg)
                errors.append(err_msg)

        # ─── Anthropic Claude ───────────────────────────────────────
        if selected_provider == "anthropic" and api_key:
            try:
                log.info(f"Attempting Anthropic image analysis with {body.model}...")
                api_model = body.model if body.model else "claude-3-5-sonnet-20240620"
                
                payload = {
                    "model": api_model,
                    "max_tokens": 1024,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/jpeg",
                                        "data": clean_base64
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": body.question
                                }
                            ]
                        }
                    ]
                }
                res = requests.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json=payload,
                    timeout=60
                )
                if res.ok:
                    data = res.json()
                    return JSONResponse({"answer": data["content"][0]["text"]})
                else:
                    err_msg = f"Anthropic API Error: {res.text}"
                    log.error(err_msg)
                    errors.append(err_msg)
            except Exception as e:
                err_msg = f"Anthropic Exception: {str(e)}"
                log.warning(err_msg)
                errors.append(err_msg)

        # ─── Ollama (Local Fallback) ──────────────────────────────
        try:
            log.info("Falling back to local Ollama (moondream)...")
            response = ollama.chat(
                model="moondream",
                messages=[{"role": "user", "content": body.question, "images": [clean_base64]}]
            )
            if response and 'message' in response:
                return JSONResponse({"answer": response['message']['content']})
        except Exception as e:
            err_msg = f"Ollama Local Error: {str(e)}"
            log.error(err_msg)
            errors.append(err_msg)

        # Final Error reporting
        combined_errors = " | ".join(errors) if errors else "No API key provided and local Ollama not found."
        raise HTTPException(
            status_code=400, 
            detail=f"Image analysis failed. {combined_errors}"
        )

        # ─── Ollama (Local Fallback) ──────────────────────────────
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
            log.info("Ollama analysis completed successfully.")
            return JSONResponse({"answer": answer})
        else:
            log.error(f"Unexpected response from Ollama: {response}")
            raise HTTPException(status_code=500, detail="Ollama returned an empty or malformed response.")

    except Exception as e:
        error_str = str(e)
        log.error(f"Image analysis error: {error_str}")
        # Return error in a field the frontend expects
        return JSONResponse(
            status_code=500,
            content={"error": f"Analysis Error: {error_str}", "detail": error_str}
        )


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


@app.post("/chat")
async def chat_handler(body: ChatRequest):
    """Unified chat endpoint that uses backend keys or user-provided keys."""
    provider = body.provider.lower()
    model = body.model
    # Priority: 1. Request Body Key, 2. Backend Environment Variable
    api_key = body.apiKey or os.environ.get(f"{provider.upper()}_API_KEY")

    SYSTEM_PROMPT = (
        "You are Afs AI, a high-end AI assistant. Always format your responses beautifully using Markdown. "
        "Use bold for emphasis and clean lists. CRITICAL: Whenever you provide content that represents a file "
        "(like code, a README.md, a text file, or any technical document), you MUST wrap it in a triple-backtick "
        "markdown code block with the appropriate language label. Always include a comment on the first line with the filename."
    )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + body.messages

    try:
        if provider == "ollama":
            # Check if Ollama is actually available
            try:
                # Short timeout to avoid hanging the request
                requests.get("http://localhost:11434/api/tags", timeout=1)
                
                response = requests.post(
                    "http://localhost:11434/api/chat",
                    json={"model": model, "messages": messages, "stream": False},
                    timeout=60
                )
                if response.ok:
                    return JSONResponse({"content": response.json()["message"]["content"]})
            except:
                # If Ollama is not available (Cloud mode), fallback to Gemini if possible
                if os.environ.get("GOOGLE_API_KEY"):
                    log.info("Ollama unavailable, falling back to Gemini for chat.")
                    provider = "gemini"
                    model = "gemini-1.5-flash"
                    api_key = os.environ.get("GOOGLE_API_KEY")
                else:
                    raise HTTPException(status_code=503, detail="Ollama is not running and no cloud fallback (GOOGLE_API_KEY) is configured.")

        if provider == "openai":
            if response.ok:
                return JSONResponse({"content": response.json()["choices"][0]["message"]["content"]})
            raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "OpenAI failed"))

        if provider == "gemini":
            if not api_key: raise HTTPException(status_code=400, detail="Gemini API Key missing")
            # Using direct REST API for chat
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [
                    {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                    for m in messages if m["role"] != "system"
                ],
                "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]}
            }
            response = requests.post(url, json=payload, timeout=60)
            if response.ok:
                return JSONResponse({"content": response.json()["candidates"][0]["content"]["parts"][0]["text"]})
            raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "Gemini failed"))

        if provider == "anthropic":
            if not api_key: raise HTTPException(status_code=400, detail="Anthropic API Key missing")
            try:
                if not api_key: raise Exception("Gemini API Key missing")
                genai.configure(api_key=api_key)
                # Ensure correct model name format
                clean_model = model if "models/" in model else f"models/{model}"
                gemini_model = genai.GenerativeModel(model_name=model)
                response = gemini_model.generate_content(
                    [m["content"] for m in messages],
                    generation_config={"temperature": 0.3}
                )
                if response.text:
                    return JSONResponse({"content": response.text})
                raise Exception("Gemini returned empty response")
            except Exception as e:
                log.warning(f"Gemini failed, checking for Ollama fallback: {e}")

        # ─── FINAL FALLBACK: If we reached here, Cloud failed or Ollama was requested ───
        try:
            requests.get("http://localhost:11434/api/tags", timeout=1)
            response = requests.post(
                "http://localhost:11434/api/chat",
                json={"model": "gemma2:2b", "messages": messages, "stream": False},
                timeout=60
            )
            if response.ok:
                return JSONResponse({"content": response.json()["message"]["content"]})
        except:
            pass

        raise HTTPException(status_code=500, detail="All AI providers (Cloud and Local) failed to respond. Please check your keys and internet connection.")

    except Exception as e:
        log.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/models")
async def get_provider_models(body: ModelsRequest):
    """Fetch available models for a provider, using backend keys if needed."""
    provider = body.provider.lower()
    api_key = body.apiKey or os.environ.get(f"{provider.upper()}_API_KEY")

    if provider == "ollama":
        try:
            res = requests.get("http://localhost:11434/api/tags", timeout=5)
            if res.ok:
                return JSONResponse({"models": [m["name"] for m in res.json().get("models", [])]})
        except: pass
        return JSONResponse({"models": ["gemma2:2b", "llama3", "moondream"]})

    if provider == "openai":
        if not api_key: return JSONResponse({"models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]})
        res = requests.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {api_key}"})
        if res.ok:
            return JSONResponse({"models": [m["id"] for m in res.json()["data"] if "gpt" in m["id"]]})

    if provider == "gemini":
        # Return defaults if no key is provided or API fetch fails
        defaults = [
            "gemini-1.5-flash", "gemini-1.5-pro",
            "gemini-2.0-flash", "gemini-2.0-pro",
            "gemini-2.5-flash", "gemini-2.5-pro",
            "gemini-3.0-flash", "gemini-3.0-pro"
        ]
        if not api_key: 
            return JSONResponse({"models": defaults})
        
        try:
            res = requests.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}", timeout=5)
            if res.ok:
                data = res.json()
                if "models" in data:
                    models = [m["name"].split("/")[-1] for m in data["models"] if "generateContent" in m.get("supportedGenerationMethods", [])]
                    if models: return JSONResponse({"models": models})
        except Exception as e:
            log.warning(f"Failed to fetch Gemini models from API: {e}")
            
        # If API call failed or returned empty, return the hardcoded defaults
        return JSONResponse({"models": defaults})

    if provider == "anthropic":
        return JSONResponse({"models": ["claude-3-5-sonnet-20240620", "claude-3-haiku-20240307", "claude-3-opus-20240229"]})

    return JSONResponse({"models": []})



# ─── Static frontend ──────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_ui():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ─── Entry point ──────────────────────────────────────────────────────────────

def clean_text_for_tts(text: str) -> str:
    """Removes emojis, markdown, and special characters for cleaner speech."""
    # Remove markdown links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Remove emojis and special symbols
    text = text.encode('ascii', 'ignore').decode('ascii')
    # Remove markdown formatting
    text = text.replace("*", "").replace("#", "").replace("`", "").replace("_", "")
    # Clean up whitespace
    return " ".join(text.split()).strip()

@app.post("/tts")
async def text_to_speech(body: Dict[str, str]):
    """Convert text to speech using edge-tts and stream it back."""
    text = body.get("text", "")
    voice = body.get("voice", "en-US-AvaNeural")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    cleaned = clean_text_for_tts(text)
    
    if not cleaned:
        # If everything was emojis, just return a small silent or generic response
        cleaned = "I am processing your request."
    
    try:
        communicate = edge_tts.Communicate(cleaned, voice)
        
        # Stream the audio directly from memory
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        
        audio_data.seek(0)
        return StreamingResponse(audio_data, media_type="audio/mpeg")
        
    except Exception as e:
        log.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
