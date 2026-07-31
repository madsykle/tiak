import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return handleShare(req);
}

export async function POST(req: NextRequest) {
  return handleShare(req);
}

async function handleShare(req: NextRequest) {
  const url = new URL(req.url);
  const data = req.method === "POST" ? await req.json().catch(() => ({})) : Object.fromEntries(url.searchParams);
  const { title, text, url: sharedUrl } = data as {
    title?: string;
    text?: string;
    url?: string;
  };

  const combinedContent = `${title || ""} ${text || ""} ${sharedUrl || ""}`;
  const urlMatch = combinedContent.match(/https?:\/\/[^\s]+/);
  const targetUrl = urlMatch ? urlMatch[0] : "";

  if (targetUrl) {
    return NextResponse.redirect(
      `${url.origin}/?share_url=${encodeURIComponent(targetUrl)}`,
      { status: 303 },
    );
  }

  return NextResponse.redirect(`${url.origin}/`, { status: 303 });
}
