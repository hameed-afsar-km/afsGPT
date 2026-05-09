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
        const { text, voice = "en-US-AvaNeural" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        const cleanedText = cleanTextForTTS(text);

        if (!cleanedText) {
            return NextResponse.json({ error: "No readable text provided" }, { status: 400 });
        }

        // Use a temp file so we avoid piping issues
        const tmpFile = path.join(tmpdir(), `tts-${randomUUID()}.mp3`);

        // Resolve python from the project .venv (one level up from /frontend)
        const pythonPath = path.join(process.cwd(), "..", ".venv", "Scripts", "python.exe");

        await execFileAsync(pythonPath, [
            "-m", "edge_tts",
            "--text", cleanedText,
            "--voice", voice,
            "--write-media", tmpFile,
        ]);

        const audioBuffer = await readFile(tmpFile);

        // Clean up temp file (don't await – fire and forget)
        unlink(tmpFile).catch(() => {});

        return new NextResponse(audioBuffer, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.length.toString(),
            },
        });
    } catch (error: any) {
        console.error("TTS error:", error?.message ?? error);
        return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
    }
}
