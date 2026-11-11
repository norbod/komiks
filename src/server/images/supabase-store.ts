// src/server/images/supabase-store.ts – implementacja ImageStore (tylko serwer!)
import { createClient } from "@supabase/supabase-js";
import type { ImageStore } from "./image-provider";

export const admin = createClient(process.env.SUPABASE_URL || "https://placeholder.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder", {
  auth: { persistSession: false },
});
const IMAGE_DAILY_LIMIT = Number(process.env.IMAGE_DAILY_LIMIT ?? 3);

// Nazwy metod pochodzą z image-provider.ts; tu "kredyt" = dzienny limit użytkownika.
export const supabaseStore: ImageStore = {
  async getCached(key) {
    const { data } = await admin.from("image_cache").select("url").eq("key", key).maybeSingle();
    return data?.url ?? null;
  },
  async putCached(key, url) { await admin.from("image_cache").upsert({ key, url }); },
  async spentTodayUsd() {
    const { data } = await admin.from("spend_daily").select("usd").eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
    return Number(data?.usd ?? 0);
  },
  async addSpend(usd) { await admin.rpc("add_spend", { p_usd: usd }); },
  async reserveCredit(userId, key) {
    const { data, error } = await admin.rpc("use_quota", { p_user: userId, p_type: "image", p_key: key, p_limit: IMAGE_DAILY_LIMIT });
    return !error && data === true;
  },
  async refundCredit(userId, key) { await admin.rpc("refund_quota", { p_user: userId, p_type: "image", p_key: key }); },
};
