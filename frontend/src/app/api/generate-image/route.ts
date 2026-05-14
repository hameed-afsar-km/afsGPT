import { NextRequest, NextResponse } from "next/server";

const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Proxy the request to the Render backend
    const response = await fetch(`${RAG_SERVER}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Generation failed" }));
      return NextResponse.json(
        { error: errorData.detail || "Image generation failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // The backend returns a success object with a URL
    // If the backend returns a full URL, use it, otherwise prepend backend URL
    const imageUrl = data.url.startsWith('http') ? data.url : `${RAG_SERVER}${data.url}`;

    // Convert the image to a dataUrl for the frontend typewriter effect (optional but recommended)
    try {
        const imgFetch = await fetch(imageUrl);
        const buffer = await imgFetch.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return NextResponse.json({
            success: true,
            dataUrl: `data:image/jpeg;base64,${base64}`,
            prompt: data.enhanced_prompt || prompt
        });
    } catch (e) {
        // Fallback to direct URL if base64 conversion fails
        return NextResponse.json({
            success: true,
            dataUrl: imageUrl,
            prompt: data.enhanced_prompt || prompt
        });
    }

  } catch (error: any) {
    console.error("Image generation proxy error:", error);
    return NextResponse.json(
      { error: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
}
