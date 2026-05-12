import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] Analyze Image request received`);
  try {
    const body = await req.json();
    const imageSize = body.image_base64?.length || 0;
    console.log(`[${requestId}] Body parsed. Image size: ${imageSize} chars. Question: ${body.question}`);
    
    const backendUrl = process.env.RAG_BACKEND_URL || "http://127.0.0.1:8001";
    console.log(`[${requestId}] Fetching from backend: ${backendUrl}/analyze-image`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    try {
      const res = await fetch(`${backendUrl}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`[${requestId}] Backend responded with status: ${res.status}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        console.error(`[${requestId}] Backend error:`, err);
        return NextResponse.json(err, { status: res.status });
      }

      const data = await res.json();
      console.log(`[${requestId}] Analysis complete.`);
      return NextResponse.json(data);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error(`[${requestId}] Request timed out after 120s`);
        return NextResponse.json({ error: "Image analysis timed out. The model might be taking too long." }, { status: 504 });
      }
      throw err;
    }
  } catch (error: any) {
    console.error(`[${requestId}] Analyze Image API Error:`, error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze image" },
      { status: 500 }
    );
  }
}
