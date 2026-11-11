import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/server/images/supabase-store";
import { buildPrompt, parseScene, demoScene, getTextProvider, MAX_SCENES } from "@/server/text";

const GENRES = ["horror","thriller","kryminał","fantasy","science fiction","dramat","postapo","przygodowy"];
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null); const s = b?.story;
  if (!b || typeof b.storyId !== "string" || !s || !GENRES.includes(s.genre) || typeof s.hero !== "string" || s.hero.length > 30 ||
      (s.idea && String(s.idea).length > 200) || !Number.isInteger(s.sceneNo) || s.sceneNo < 1 || s.sceneNo > MAX_SCENES ||
      ![null, "TAK", "NIE"].includes(b.choice ?? null) || !s.mem || !Array.isArray(s.mem.facts))
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  s.idea = String(s.idea ?? "").slice(0, 200); s.hero = s.hero.slice(0, 30); s.trait = String(s.trait ?? "").slice(0, 40);
  s.mem = { facts: s.mem.facts.slice(-30).map(String), threads: (s.mem.threads ?? []).slice(-10).map(String), summary: String(s.mem.summary ?? "").slice(0, 400) };

  const merge = (r: any) => ({ scene: r.scene, mem: { facts: [...s.mem.facts, ...r.facts].slice(-30), threads: r.threads.length ? r.threads : s.mem.threads, summary: r.summary || s.mem.summary } });
  const provider = getTextProvider();
  if (!provider) return NextResponse.json(merge(demoScene(s, b.choice ?? null)));

  const key = `${u.user.id}:${b.storyId.slice(0, 64)}:${s.sceneNo}:text`;
  const { data: ok } = await admin.rpc("use_quota", { p_user: u.user.id, p_type: "text", p_key: key, p_limit: Number(process.env.TEXT_DAILY_LIMIT ?? 12) });
  if (!ok) return NextResponse.json({ error: "limit" }, { status: 429 });
  for (let i = 0; i < 2; i++) {
    try { return NextResponse.json(merge(parseScene(await provider.generate(buildPrompt(s, b.choice ?? null)), s.sceneNo))); }
    catch { await new Promise((r) => setTimeout(r, 700)); }
  }
  await admin.rpc("refund_quota", { p_user: u.user.id, p_type: "text", p_key: key });
  return NextResponse.json(merge(demoScene(s, b.choice ?? null))); // awaria AI → DEMO, oznaczone w UI
}
