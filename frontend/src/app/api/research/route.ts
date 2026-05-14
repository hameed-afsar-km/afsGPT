import { NextRequest, NextResponse } from "next/server";

const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const { query, provider, model, apiKey } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "Query cannot be empty." }, { status: 400 });
    }

    const res = await fetch(`${RAG_SERVER}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        provider: provider || "ollama",
        model: model || "gemma2:2b",
        api_key: apiKey || "",
      }),
      // Research can take a while — give it 90 seconds
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Research failed" }));
      return NextResponse.json({ error: err.detail || "Research failed" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ answer: data.answer });
  } catch (error: any) {
    if (error.name === "TimeoutError") {
      return NextResponse.json({ error: "Research timed out. Try a simpler query." }, { status: 504 });
    }
    console.error("[/api/research] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
