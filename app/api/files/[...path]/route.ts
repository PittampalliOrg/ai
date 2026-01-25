import { NextRequest, NextResponse } from "next/server";
import { read, head } from "@/lib/storage/local";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathname = `/files/${path.join("/")}`;

  const fileInfo = await head(pathname);
  if (!fileInfo) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileBuffer = await read(pathname);
  if (!fileBuffer) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  const headers: HeadersInit = {
    "Content-Type": fileInfo.contentType,
    "Content-Length": fileInfo.size.toString(),
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  if (download) {
    const filename = path[path.length - 1];
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(new Uint8Array(fileBuffer), { headers });
}
