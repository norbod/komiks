/**
 * AI COMIC – moduł ilustracji (src/server/images/image-provider.ts)
 * Działa WYŁĄCZNIE po stronie serwera (route handler Next.js).
 * Status: NIEPRZETESTOWANY – wymaga klucza API i uruchomienia u Ciebie.
 *
 * .env.example
 *   IMAGES_ENABLED=false            # wyłącznik awaryjny kosztów
 *   IMAGE_PROVIDER=replicate        # replicate | none
 *   REPLICATE_API_TOKEN=            # klucz (nigdy w kodzie przeglądarki)
 *   IMAGE_COST_USD=0.01             # Twoja ocena kosztu 1 obrazu (sprawdź cennik)
 *   DAILY_BUDGET_USD=2              # twardy limit dzienny
 */

export type ImageRequest = {
  storyId: string;
  sceneNo: number;
  style: "mroczny-realistyczny" | "noir" | "komiks";
  characterSheet: string; // STAŁY opis bohatera, zapisany raz przy starcie historii
  sceneDescription: string; // opis ilustracji z Story Engine
};
export type ImageResult = { url: string; costUsd: number; cached: boolean } | null;

export interface ImageGenerationProvider {
  name: string;
  generate(prompt: string, seed: number): Promise<{ url: string; costUsd: number }>;
}

/** Magazyn i rozliczenia – podłącz do Supabase (StorageProvider / BillingProvider). */
export interface ImageStore {
  getCached(key: string): Promise<string | null>;
  putCached(key: string, url: string): Promise<void>;
  spentTodayUsd(): Promise<number>;
  addSpend(usd: number): Promise<void>;
  /** Atomowo odejmij kredyt obrazkowy; false gdy brak. Ma być jedna transakcja SQL. */
  reserveCredit(userId: string, idempotencyKey: string): Promise<boolean>;
  refundCredit(userId: string, idempotencyKey: string): Promise<void>;
}

const STYLE_PROMPTS: Record<ImageRequest["style"], string> = {
  "mroczny-realistyczny":
    "dark cinematic realism, photorealistic, film noir lighting, desaturated colors, heavy shadows, fog, 35mm film grain, serious tone, moody atmosphere, no text, no speech bubbles",
  noir: "black and white film noir photograph, high contrast, deep shadows, no text",
  komiks: "graphic novel illustration, bold ink lines, muted palette, no text",
};

function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Spójność postaci: ten sam opis + ten sam seed dla całej historii. */
export function buildPrompt(r: ImageRequest) {
  const prompt = `${STYLE_PROMPTS[r.style]}. Main character (always identical): ${r.characterSheet}. Scene: ${r.sceneDescription}. 16:9 wide shot.`;
  return { prompt, seed: hash(r.storyId) % 2_000_000_000 };
}

/** Dostawca nr 1: Flux schnell przez Replicate (tani). Zweryfikuj format w dokumentacji Replicate. */
export class ReplicateFlux implements ImageGenerationProvider {
  name = "replicate-flux-schnell";
  async generate(prompt: string, seed: number) {
    const res = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: { prompt, seed, aspect_ratio: "16:9", num_outputs: 1, output_format: "webp" },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) throw new Error(`image provider ${res.status}`);
    const data = await res.json();
    const url = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!url) throw new Error("image provider: brak wyniku");
    return { url, costUsd: Number(process.env.IMAGE_COST_USD ?? 0.01) };
  }
}

function getProvider(): ImageGenerationProvider | null {
  switch (process.env.IMAGE_PROVIDER) {
    case "replicate":
      return process.env.REPLICATE_API_TOKEN ? new ReplicateFlux() : null;
    default:
      return null; // tryb bez płatnych API → UI pokazuje ilustracje zastępcze
  }
}

/**
 * Jedyna funkcja wołana z API. Zwraca null => frontend pokazuje SVG zastępcze.
 * Kolejność zabezpieczeń: wyłącznik → cache → budżet dzienny → kredyt użytkownika → generowanie → zwrot kredytu przy błędzie.
 */
export async function generateSceneImage(
  userId: string,
  req: ImageRequest,
  store: ImageStore,
  provider: ImageGenerationProvider | null = getProvider()
): Promise<ImageResult> {
  if (process.env.IMAGES_ENABLED !== "true" || !provider) return null;

  const { prompt, seed } = buildPrompt(req);
  const key = `img:${hash(prompt)}:${seed}`;

  const cached = await store.getCached(key);
  if (cached) return { url: cached, costUsd: 0, cached: true };

  const budget = Number(process.env.DAILY_BUDGET_USD ?? 0);
  const est = Number(process.env.IMAGE_COST_USD ?? 0.01);
  if ((await store.spentTodayUsd()) + est > budget) return null;

  const idem = `${userId}:${req.storyId}:${req.sceneNo}`; // ten sam klik = ten sam klucz
  if (!(await store.reserveCredit(userId, idem))) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await provider.generate(prompt, seed);
      await store.putCached(key, out.url); // w produkcji skopiuj plik do własnego storage – URL dostawcy wygasa
      await store.addSpend(out.costUsd);
      return { ...out, cached: false };
    } catch {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  await store.refundCredit(userId, idem);
  return null;
}
