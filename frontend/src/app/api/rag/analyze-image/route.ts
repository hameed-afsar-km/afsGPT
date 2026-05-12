import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] Analyze Image request received`);
  try {
    const body = await req.json();
    const imageSize = body.image_base64?.length || 0;
    console.log(`[${requestId}] Body parsed. Image size: ${imageSize} chars. Question: ${body.question}`);
    
    const backendUrl = process.env.RAG_BACKEND_URL || "http://localhost:8001";
    console.log(`[${requestId}] Fetching from backend: ${backendUrl}/analyze-image`);

    const res = await fetch(`${backendUrl}/analyze-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    console.log(`[${requestId}] Backend responded with status: ${res.status}`);

    if (!res.ok) {
      const err = await res.text();
      console.error(`[${requestId}] Backend error:`, err);
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    console.log(`[${requestId}] Analysis complete.`);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[${requestId}] Analyze Image API Error:`, error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze image" },
      { status: 500 }
    );
  }
}
