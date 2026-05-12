import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { messages, provider, model, apiKey } = await req.json();

        if (!provider || !model) {
            return NextResponse.json({ error: "Provider and model are required" }, { status: 400 });
        }

        const SYSTEM_PROMPT = "You are Afs AI, a high-end AI assistant. Always format your responses beautifully using Markdown. Use bold for emphasis, create clean lists when appropriate, and use code blocks for any technical content. Maintain a professional yet friendly tone. If providing code, ensure it is complete and properly commented.";
        
        const formattedMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map((m: any) => ({ role: m.role, content: m.content }))
        ];

        // Handle different providers
        if (provider === "ollama") {
            try {
                const response = await fetch("http://localhost:11434/api/chat", {
                    method: "POST",
                    body: JSON.stringify({
                        model: model,
                        messages: formattedMessages,
                        stream: false
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ content: data.message.content });
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
                        messages: formattedMessages
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ content: data.choices[0].message.content });
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
                        contents: formattedMessages.filter(m => m.role !== "system").map((m: any) => ({
                            role: m.role === "assistant" ? "model" : "user",
                            parts: [{ text: m.content }]
                        })),
                        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ content: data.candidates[0].content.parts[0].text });
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
                        max_tokens: 1024,
                        system: SYSTEM_PROMPT,
                        messages: formattedMessages.filter(m => m.role !== "system")
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ content: data.content[0].text });
                }
                const errorData = await response.json();
                return NextResponse.json({ error: errorData.error?.message || "Anthropic chat failed" }, { status: response.status });
            } catch (err) {
                return NextResponse.json({ error: "Anthropic connection failed" }, { status: 500 });
            }
        }

        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });

    } catch (error) {
        console.error("Chat API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
