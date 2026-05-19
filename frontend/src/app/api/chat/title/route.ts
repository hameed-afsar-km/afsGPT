import { NextRequest, NextResponse } from "next/server";

const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
    try {
        let { message, provider, model, apiKey } = await req.json();

        if (!provider || !model) {
            return NextResponse.json({ error: "Provider and model are required" }, { status: 400 });
        }

        // Handle default model mapping
        if (model === "Use default models (Qwen 1.5B + Gemma 2B + Moondream)") {
            model = "gemma2:2b";
        }

        const systemPrompt = "You are a helpful assistant. Provide a very short summary (maximum 3-4 words) for the following message, to be used as a chat title. Do NOT use quotes, just return the words.";
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
        ];

        // Call Python FastAPI backend `/chat` which has access to backend API keys and supports overrides
        const response = await fetch(`${RAG_SERVER}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: messages,
                provider: provider,
                model: model,
                apiKey: apiKey || ""
            })
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json({ title: data.content.trim() });
        }

        const errorData = await response.json().catch(() => ({ detail: "Failed to generate title from backend" }));
        return NextResponse.json({ error: errorData.detail || "Failed to generate title" }, { status: response.status });

    } catch (error: any) {
        console.error("Title API proxy error:", error);
        return NextResponse.json({ error: "Failed to connect to backend" }, { status: 500 });
    }
}
