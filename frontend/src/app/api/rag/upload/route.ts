import { NextRequest, NextResponse } from "next/server";

const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const response = await fetch(`${RAG_SERVER}/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: `RAG server unreachable: ${error.message}` },
      { status: 503 }
    );
  }
}
