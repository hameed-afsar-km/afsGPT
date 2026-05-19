"""
research_agent.py — LangGraph-powered Research Agent using DuckDuckGo Search.

Flow:
  1. Planner    — Decompose the query into targeted sub-questions
  2. Searcher   — Run DuckDuckGo search for each sub-question
  3. Synthesizer — Combine results into a well-structured Markdown answer
"""

import os
import logging
from typing import TypedDict, Annotated, List
import operator

from langchain_community.tools import DuckDuckGoSearchRun
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

log = logging.getLogger(__name__)

# ─── State ────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    query: str
    sub_questions: List[str]
    search_results: Annotated[List[str], operator.add]
    final_answer: str
    provider: str
    model: str
    api_key: str

# ─── Tool ─────────────────────────────────────────────────────────────────────

search_tool = DuckDuckGoSearchRun()

# ─── LLM Factory ──────────────────────────────────────────────────────────────

def get_llm(provider: str, model: str, api_key: str):
    """Return an LLM instance based on provider, with cloud fallback."""
    google_key = api_key or os.environ.get("GOOGLE_API_KEY")
    
    # Auto-switch to Gemini if on cloud (Render) and Ollama isn't requested specifically with local intent
    if provider == "ollama":
        # Check if ollama is actually running
        import requests
        try:
            requests.get("http://localhost:11434/api/tags", timeout=1)
            return ChatOllama(model=model or "gemma2:2b", temperature=0.3)
        except:
            # Fallback to Gemini if ollama is down (common on Render/Cloud)
            if google_key:
                from langchain_google_genai import ChatGoogleGenerativeAI
                return ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=google_key, temperature=0.3)
    
    if provider == "gemini" or (provider == "ollama" and google_key):
        from langchain_google_genai import ChatGoogleGenerativeAI
        # If user selected a gemini model, use it. If they selected ollama but we're on cloud, fallback to flash.
        target_model = model if (provider == "gemini" and model) else "gemini-1.5-flash"
        return ChatGoogleGenerativeAI(
            model=target_model,
            google_api_key=google_key,
            temperature=0.3
        )
    
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        key = api_key or os.environ.get("OPENAI_API_KEY")
        return ChatOpenAI(model=model, api_key=key, temperature=0.3)

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI
        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        return ChatOpenAI(
            model=model or "google/gemini-2.5-flash", 
            api_key=key, 
            base_url="https://openrouter.ai/api/v1", 
            temperature=0.3
        )
    
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        return ChatAnthropic(model=model, api_key=key, temperature=0.3)
    
    # Final Fallback: Ollama (Local)
    return ChatOllama(model="gemma2:2b", temperature=0.3)

# ─── Nodes ────────────────────────────────────────────────────────────────────

def planner_node(state: ResearchState) -> dict:
    """Break the query into 2-3 targeted sub-questions."""
    log.info(f"[Research] Planning sub-questions for: {state['query']}")
    llm = get_llm(state["provider"], state["model"], state["api_key"])
    
    prompt = f"""You are a research planner. Break the following query into 2-3 specific, concise search queries that will help gather comprehensive information.

Query: {state['query']}

Return ONLY the search queries, one per line, no numbering, no explanation."""

    response = llm.invoke([HumanMessage(content=prompt)])
    sub_questions = [q.strip() for q in response.content.strip().split("\n") if q.strip()][:3]
    log.info(f"[Research] Sub-questions: {sub_questions}")
    return {"sub_questions": sub_questions}


def searcher_node(state: ResearchState) -> dict:
    """Run DuckDuckGo search for each sub-question."""
    results = []
    for q in state["sub_questions"]:
        log.info(f"[Research] Searching: {q}")
        try:
            result = search_tool.invoke(q)
            results.append(f"**Query:** {q}\n**Results:**\n{result}")
        except Exception as e:
            log.warning(f"[Research] Search failed for '{q}': {e}")
            results.append(f"**Query:** {q}\n**Results:** Search failed.")
    return {"search_results": results}


def synthesizer_node(state: ResearchState) -> dict:
    """Synthesize all search results into a comprehensive Markdown answer."""
    log.info("[Research] Synthesizing final answer...")
    llm = get_llm(state["provider"], state["model"], state["api_key"])
    
    combined = "\n\n---\n\n".join(state["search_results"])
    
    system = """You are Afs AI Research Agent. You are given a user's research question and raw search results.
Your job is to synthesize these into a comprehensive, well-structured Markdown answer.
- Use headers (##) to organize sections
- Use bullet points for key facts
- Cite sources where possible
- End with a **Summary** section
- Format all technical content in code blocks"""

    prompt = f"""**User's Original Question:**
{state['query']}

**Research Findings:**
{combined}

Write a comprehensive, well-structured answer based on these findings."""

    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=prompt)])
    return {"final_answer": response.content}

# ─── Graph ────────────────────────────────────────────────────────────────────

def build_research_graph():
    graph = StateGraph(ResearchState)
    graph.add_node("planner", planner_node)
    graph.add_node("searcher", searcher_node)
    graph.add_node("synthesizer", synthesizer_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "searcher")
    graph.add_edge("searcher", "synthesizer")
    graph.add_edge("synthesizer", END)

    return graph.compile()

research_graph = build_research_graph()

# ─── Public API ───────────────────────────────────────────────────────────────

def run_research(query: str, provider: str = "ollama", model: str = "gemma2:2b", api_key: str = "") -> str:
    """Run the full research pipeline and return a Markdown answer."""
    initial_state: ResearchState = {
        "query": query,
        "sub_questions": [],
        "search_results": [],
        "final_answer": "",
        "provider": provider,
        "model": model,
        "api_key": api_key,
    }
    result = research_graph.invoke(initial_state)
    return result["final_answer"]
