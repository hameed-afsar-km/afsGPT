import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { provider, apiKey } = await req.json();

        if (provider === "ollama") {
            try {
                const response = await fetch("http://localhost:11434/api/tags");
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ 
                        models: data.models.map((m: any) => m.name) 
                    });
                }
                return NextResponse.json({ models: [], error: "Ollama not running" });
            } catch (err) {
                return NextResponse.json({ models: [], error: "Ollama connection failed" });
            }
        }

        if (provider === "openai") {
            if (!apiKey) return NextResponse.json({ models: [] });
            try {
                const response = await fetch("https://api.openai.com/v1/models", {
                    headers: { "Authorization": `Bearer ${apiKey}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    // Filter for chat models
                    const models = data.data
                        .filter((m: any) => m.id.startsWith("gpt-"))
                        .map((m: any) => m.id)
                        .sort();
                    return NextResponse.json({ models });
                }
                return NextResponse.json({ models: [], error: "Invalid API Key" });
            } catch (err) {
                return NextResponse.json({ models: [], error: "Failed to fetch OpenAI models" });
            }
        }

        if (provider === "gemini") {
            // Gemini model listing is a bit complex via API, providing common ones
            return NextResponse.json({ 
                models: [
                    "gemini-3-flash",
                    "gemini-2.5-flash", 
                    "gemini-2.5-pro", 
                    "gemini-1.5-flash", 
                    "gemini-1.5-pro", 
                    "gemini-1.0-pro"
                ] 
            });
        }

        if (provider === "anthropic") {
            // Anthropic models
            return NextResponse.json({ 
                models: [
                    "claude-3-5-sonnet-20240620", 
                    "claude-3-opus-20240229", 
                    "claude-3-sonnet-20240229", 
                    "claude-3-haiku-20240307"
                ] 
            });
        }

        return NextResponse.json({ models: [] });
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
