import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { execFile } from "child_process";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
    try {
        const { text, voice = "en-US-AvaNeural" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        // Use a temp file so we avoid piping issues
        const tmpFile = path.join(tmpdir(), `tts-${randomUUID()}.mp3`);

        // Resolve python from the project .venv (one level up from /frontend)
        const pythonPath = path.join(process.cwd(), "..", ".venv", "Scripts", "python.exe");

        await execFileAsync(pythonPath, [
            "-m", "edge_tts",
            "--text", text,
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
