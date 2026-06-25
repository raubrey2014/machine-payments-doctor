import { NextResponse } from "next/server";
import { runDoctorCheck } from "../../lib/doctor-service";

function parseTargetUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string") return null;

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return null;

  try {
    const url = new URL(trimmedUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawUrl = body && typeof body === "object" && "url" in body
    ? (body as { url?: unknown }).url
    : undefined;

  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const targetUrl = parseTargetUrl(rawUrl);
  if (!targetUrl) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const result = await runDoctorCheck({ url: targetUrl });
  return NextResponse.json(result);
}
