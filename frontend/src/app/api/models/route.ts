import { NextRequest, NextResponse } from "next/server";

const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        // Proxy the request to the Render backend
        const response = await fetch(`${RAG_SERVER}/models`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        }

        // Return empty list instead of failing to avoid UI breakage
        return NextResponse.json({ models: [] });
    } catch (error: any) {
        console.error("Models proxy error:", error);
        return NextResponse.json({ models: [] });
    }
}
