// app/api/scene-image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { admin, supabaseStore } from "@/server/images/supabase-store";
import { generateSceneImage, type ImageRequest } from "@/server/images/image-provider";

const STYLES = ["mroczny-realistyczny", "noir", "komiks"];

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b.storyId !== "string" || !Number.isInteger(b.sceneNo) || b.sceneNo < 1 || b.sceneNo > 50 ||
      !STYLES.includes(b.style) || typeof b.characterSheet !== "string" || b.characterSheet.length > 300 ||
      typeof b.sceneDescription !== "string" || b.sceneDescription.length > 500)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // limit tempa: max 5 obrazów / minutę / użytkownik
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("usage_log").select("id", { count: "exact", head: true })
    .eq("user_id", u.user.id).eq("kind", "image").gte("created_at", since);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const r: ImageRequest = { storyId: b.storyId.slice(0, 64), sceneNo: b.sceneNo, style: b.style,
    characterSheet: b.characterSheet, sceneDescription: b.sceneDescription };
  const out = await generateSceneImage(u.user.id, r, supabaseStore);
  return out ? NextResponse.json({ url: out.url, cached: out.cached }) : NextResponse.json({ fallback: true });
}
