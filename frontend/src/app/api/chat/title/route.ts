import { NextRequest, NextResponse } from "next/server";

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

        // Handle different providers
        if (provider === "ollama") {
            try {
                const response = await fetch("http://localhost:11434/api/chat", {
                    method: "POST",
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        stream: false
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ title: data.message.content.trim() });
                }
                return NextResponse.json({ error: "Ollama chat failed" }, { status: 500 });
            } catch (err) {
                return NextResponse.json({ error: "Could not connect to Ollama" }, { status: 500 });
            }
        }

        if (provider === "openai") {
            if (!apiKey) return NextResponse.json({ error: "API Key required" }, { status: 400 });
            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ title: data.choices[0].message.content.trim() });
                }
                const errorData = await response.json();
                return NextResponse.json({ error: errorData.error?.message || "OpenAI chat failed" }, { status: response.status });
            } catch (err) {
                return NextResponse.json({ error: "OpenAI connection failed" }, { status: 500 });
            }
        }

        if (provider === "gemini") {
            if (!apiKey) return NextResponse.json({ error: "Gemini API Key required" }, { status: 400 });
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ role: "user", parts: [{ text: message }] }]
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ title: data.candidates[0].content.parts[0].text.trim() });
                }
                const errorData = await response.json();
                return NextResponse.json({ error: errorData.error?.message || "Gemini chat failed" }, { status: response.status });
            } catch (err) {
                return NextResponse.json({ error: "Gemini connection failed" }, { status: 500 });
            }
        }

        if (provider === "anthropic") {
            if (!apiKey) return NextResponse.json({ error: "Anthropic API Key required" }, { status: 400 });
            try {
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify({
                        model: model,
                        max_tokens: 20,
                        system: systemPrompt,
                        messages: [{ role: "user", content: message }]
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ title: data.content[0].text.trim() });
                }
                const errorData = await response.json();
                return NextResponse.json({ error: errorData.error?.message || "Anthropic chat failed" }, { status: response.status });
            } catch (err) {
                return NextResponse.json({ error: "Anthropic connection failed" }, { status: 500 });
            }
        }

        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });

    } catch (error) {
        console.error("Title API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
