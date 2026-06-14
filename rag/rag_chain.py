"""
rag_chain.py — Build and run the RAG pipeline using OllamaLLM + ChromaDB retriever.
"""

import os
from langchain_ollama.llms import OllamaLLM
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from vector import get_retriever, _ensure_ollama_model

from typing import Optional

# ─── LLM ──────────────────────────────────────────────────────────────────────

LLM_MODEL = "gemma2:2b"    # swap to any model pulled via `ollama pull`

_llm_cache: dict = {}

def _llm_cache_key(api_key: Optional[str] = None) -> str:
    google_key = api_key or os.environ.get("GOOGLE_API_KEY")
    return f"google:{google_key}" if google_key else "ollama"

def get_llm(api_key: Optional[str] = None):
    """Dynamically choose the LLM for RAG. Cached."""
    key = _llm_cache_key(api_key)
    if key in _llm_cache:
        return _llm_cache[key]
    google_key = api_key or os.environ.get("GOOGLE_API_KEY")
    if google_key:
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=google_key)
    else:
        _ensure_ollama_model(LLM_MODEL)
        llm = OllamaLLM(model=LLM_MODEL)
    _llm_cache[key] = llm
    return llm


# ─── Prompt ───────────────────────────────────────────────────────────────────

RAG_PROMPT = """
You are an expert document analyst. Use ONLY the context below to answer the user's question.
If the answer is not found in the context, say: "I couldn't find that information in the uploaded document."
Do not fabricate information. Be concise and precise.

Context:
{context}

Question:
{question}

Answer:
"""

prompt = ChatPromptTemplate.from_template(RAG_PROMPT)

# ─── Chain builder ────────────────────────────────────────────────────────────

_chain_cache: dict = {}

def _format_docs(docs) -> str:
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


def build_rag_chain(collection_name: str = "rag_store", api_key: Optional[str] = None):
    """Return a runnable RAG chain for the given ChromaDB collection. Cached."""
    key = f"{collection_name}:{_llm_cache_key(api_key)}"
    if key in _chain_cache:
        return _chain_cache[key]
    retriever = get_retriever(collection_name=collection_name, api_key=api_key)
    llm = get_llm(api_key=api_key)

    chain = (
        {
            "context": retriever | _format_docs,
            "question": RunnablePassthrough(),
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    _chain_cache[key] = chain
    return chain


def query(question: str, collection_name: str = "rag_store", api_key: Optional[str] = None) -> str:
    """Convenience function: build chain and invoke with a question."""
    chain = build_rag_chain(collection_name=collection_name, api_key=api_key)
    return chain.invoke(question)
