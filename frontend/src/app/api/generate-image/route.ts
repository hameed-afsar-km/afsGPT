import { NextRequest, NextResponse } from "next/server";

const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      return NextResponse.json(
        { error: "HF_TOKEN is not configured on the server." },
        { status: 500 }
      );
    }

    const cleanToken = hfToken.trim().replace(/^["']|["']$/g, "");

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          guidance_scale: 0.0,
          num_inference_steps: 4,
          max_sequence_length: 256,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HF API Error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `Image generation failed: ${errorText}` },
        { status: response.status }
      );
    }

    // HF returns raw image bytes — convert to base64 data URL
    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    return NextResponse.json({
      success: true,
      dataUrl,
      prompt,
    });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
}
