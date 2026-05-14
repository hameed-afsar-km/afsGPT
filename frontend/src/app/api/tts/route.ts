import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { execFile } from "child_process";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

function cleanTextForTTS(text: string): string {
    return text
        // Remove emojis and symbols
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
        .replace(/[\u{1F700}-\u{1F77F}]/gu, '') // Alchemical Symbols
        .replace(/[\u{1F780}-\u{1F7FF}]/gu, '') // Geometric Shapes Extended
        .replace(/[\u{1F800}-\u{1F8FF}]/gu, '') // Supplemental Arrows-C
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
        // Remove URLs in Markdown links [text](url) -> text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code backticks
        .replace(/`/g, '')
        // Remove markdown formatting characters (asterisks, underscores, hashes, tildes)
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
        .replace(/(\*|_)(.*?)\1/g, '$2')    // italic
        .replace(/~~(.*?)~~/g, '$1')        // strikethrough
        .replace(/^[#>-]\s+/gm, '')         // headers, blockquotes, lists
        .replace(/[*_~#]/g, '')             // stray formatting characters
        // Collapse multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const RAG_SERVER = process.env.RAG_BACKEND_URL || "http://localhost:8001";

        const response = await fetch(`${RAG_SERVER}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: "TTS failed on backend" }));
            return NextResponse.json(err, { status: response.status });
        }

        const audioBuffer = await response.arrayBuffer();

        return new NextResponse(audioBuffer, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
        });
    } catch (error: any) {
        console.error("TTS proxy error:", error);
        return NextResponse.json({ error: "TTS proxy failed" }, { status: 500 });
    }
}
