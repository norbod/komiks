// Silnik fabuły + wymienny dostawca tekstu. Tylko serwer.
export interface TextGenerationProvider { name: string; generate(prompt: string): Promise<string> }

export class Gemini implements TextGenerationProvider {
  name = "gemini";
  async generate(prompt: string) {
    const m = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 800, temperature: 0.9 } }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) throw new Error("text provider " + r.status);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
export const getTextProvider = (): TextGenerationProvider | null => (process.env.GEMINI_API_KEY ? new Gemini() : null);

export type Mem = { facts: string[]; threads: string[]; summary: string };
export const MAX_SCENES = 10;

export function buildPrompt(s: any, choice: string | null) {
  const state = JSON.stringify({ gatunek: s.genre, pomysl: s.idea, bohater: s.hero, cecha: s.trait,
    streszczenie: s.mem.summary, fakty: s.mem.facts.slice(-12), watki: s.mem.threads.slice(-6), ostatnie_pytanie: s.lastQ, decyzja: choice });
  const last = s.sceneNo >= MAX_SCENES;
  return `Jesteś silnikiem interaktywnego komiksu po polsku, ton mroczny i poważny. Stan: ${state}. Napisz scenę ${s.sceneNo}/${MAX_SCENES}. ${choice ? "Decyzja czytelnika (" + choice + ") musi realnie zmienić fabułę." : "To początek."} ${last ? 'Scena końcowa: zamknij wątki, "q" puste.' : ""} Zachowaj spójność postaci. Zwróć WYŁĄCZNIE JSON: {"title":"","narr":"2-3 zdania","dlg":[{"who":"","text":""}],"sit":"","q":"pytanie TAK/NIE","yes":"4 słowa","no":"4 słowa","facts":[""],"threads":[""],"summary":"max 60 słów","art":"opis ilustracji po angielsku"}`;
}
const str = (v: any, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
export function parseScene(raw: string, sceneNo: number) {
  const j = JSON.parse(raw.replace(/```json|```/g, "").trim());
  const end = sceneNo >= MAX_SCENES;
  if (!str(j.title, 80) || !str(j.narr, 600) || (!end && !str(j.q, 200))) throw new Error("bad scene");
  return { scene: { title: str(j.title, 80), narr: str(j.narr, 600), sit: str(j.sit, 200), q: str(j.q, 200), yes: str(j.yes, 50), no: str(j.no, 50), art: str(j.art, 300), end, mode: "AI",
    dlg: (Array.isArray(j.dlg) ? j.dlg : []).slice(0, 3).map((d: any) => ({ who: str(d.who, 40), text: str(d.text, 200) })) },
    facts: (Array.isArray(j.facts) ? j.facts : []).map((x: any) => str(x, 120)).filter(Boolean), threads: (Array.isArray(j.threads) ? j.threads : []).map((x: any) => str(x, 120)).filter(Boolean), summary: str(j.summary, 400) };
}
// Tryb DEMO: szablon, NIE AI – oznaczany w UI.
export function demoScene(s: any, choice: string | null) {
  const n = s.sceneNo, h = s.hero, end = n >= MAX_SCENES;
  return { scene: { title: n === 1 ? "Początek" : end ? "Zakończenie" : `Scena ${n}`, mode: "DEMO", end, art: "", sit: "Tryb demonstracyjny (szablon).",
    narr: n === 1 ? `${h} staje przed nieznanym. ${s.idea || ""}` : `${h} wybrał: ${choice}. Świat reaguje na tę decyzję.`,
    dlg: [{ who: h, text: choice === "NIE" ? "Muszę to przemyśleć." : "Nie ma odwrotu." }], q: end ? "" : "Czy iść dalej?", yes: "Zaryzykować", no: "Zachować dystans" },
    facts: [`Scena ${n}: ${choice ?? "start"}`], threads: [], summary: (s.mem.summary + " " + (choice ?? "")).slice(-300) };
}
