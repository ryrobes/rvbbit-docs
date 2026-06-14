import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

/** Lists scroll-video files in public/alice/, preferring webm over mp4. */
export async function GET() {
  try {
    const dir = join(process.cwd(), "public", "alice");
    const entries = await readdir(dir);
    const webm = entries.filter((f) => f.endsWith(".webm"));
    const files =
      webm.length > 0 ? webm : entries.filter((f) => f.endsWith(".mp4"));
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
