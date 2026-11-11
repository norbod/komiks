import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = !!(url && key);
// Zapasowe wartości, żeby brak zmiennych nie wywalał całej aplikacji.
export const sb = createClient(url || "https://placeholder.supabase.co", key || "placeholder");
