import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.MANGO_API_BASE_URL || "https://sms.bigmango.org";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!/^[A-Za-z0-9._~-]{20,512}$/.test(token)) {
    return NextResponse.json({ error: "invalid_link" }, { status: 400 });
  }

  const upstream = await fetch(
    `${API_BASE}/v1/app/me?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
