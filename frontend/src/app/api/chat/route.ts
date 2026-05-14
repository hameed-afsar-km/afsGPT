import { NextRequest, NextResponse } from "next/server";

const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        // Proxy the request to the Render backend
        const response = await fetch(`${RAG_SERVER}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        }

        const errorData = await response.json().catch(() => ({ detail: "Chat failed" }));
        return NextResponse.json(
            { error: errorData.detail || errorData.error || "Backend chat failed" },
            { status: response.status }
        );

    } catch (error: any) {
        console.error("Chat proxy error:", error);
        return NextResponse.json({ error: "Failed to connect to backend" }, { status: 500 });
    }
}
