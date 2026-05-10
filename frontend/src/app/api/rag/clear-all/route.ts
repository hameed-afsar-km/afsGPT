import { NextResponse } from "next/server";

export async function DELETE() {
  try {
    const backendUrl = process.env.RAG_BACKEND_URL || "http://localhost:8001";
    
    const res = await fetch(`${backendUrl}/clear-all`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Clear All API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to clear files" },
      { status: 500 }
    );
  }
}
