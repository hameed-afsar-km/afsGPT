import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { model } = await req.json();
        
        if (!model) {
            return NextResponse.json({ error: "Model name required" }, { status: 400 });
        }

        const response = await fetch("http://localhost:11434/api/pull", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            // Wait for completion
            body: JSON.stringify({ name: model, stream: false }), 
        });

        if (response.ok) {
            return NextResponse.json({ success: true });
        } else {
            const data = await response.json();
            return NextResponse.json({ error: data.error || "Failed to pull model" }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
