"use client";
import { useEffect, useState } from "react";
import { sb, configured } from "@/lib/supabase";
const GENRES = ["horror","thriller","kryminał","fantasy","science fiction","dramat","postapo","przygodowy"];
const Art = ({ n, hero }: { n: number; hero: string }) => { const h = [...hero].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <svg viewBox="0 0 400 220" style={{ width: "100%", display: "block", borderRadius: 8 }}><defs><linearGradient id={"g" + n} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10141a"/><stop offset="1" stopColor="#1f252d"/></linearGradient></defs>
  <rect width="400" height="220" fill={`url(#g${n})`}/><polygon points="180,0 220,0 300,200 100,200" fill="#c1121f" opacity=".12"/><rect y="190" width="400" height="30" fill="#050607"/>
  <path d={`M${150 + (n % 3) * 25} 190 L${158 + (n % 3) * 25} 100 Q${175 + (n % 3) * 25} 80 ${190 + (n % 3) * 25} 100 L${198 + (n % 3) * 25} 190Z`} fill={`hsl(${h},14%,17%)`} stroke="#c1121f" strokeOpacity=".5"/><circle cx={174 + (n % 3) * 25} cy="82" r="14" fill="#0d0f13" stroke="#c1121f" strokeOpacity=".5"/></svg>; };

export default function Home() {
  const [uid, setUid] = useState<string | null>(null), [tok, setTok] = useState(""), [email, setEmail] = useState(""), [msg, setMsg] = useState("");
  const [list, setList] = useState<any[]>([]), [s, setS] = useState<any>(null), [busy, setBusy] = useState(false), [f, setF] = useState({ hero: "", genre: "horror", idea: "" });
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setUid(data.session?.user.id ?? null); setTok(data.session?.access_token ?? ""); });
    const { data: l } = sb.auth.onAuthStateChange((_e, ses) => { setUid(ses?.user.id ?? null); setTok(ses?.access_token ?? ""); });
    return () => l.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (uid) sb.from("stories").select("id,data").order("updated_at", { ascending: false }).then(({ data }) => setList(data ?? [])); }, [uid, s]);
  async function login() { const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); setMsg(error ? error.message : "Wysłaliśmy link logowania na e-mail."); }
  async function gen(story: any, choice: string | null) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/scene", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ storyId: story.id, choice, story: { genre: story.genre, idea: story.idea, hero: story.hero, trait: story.trait, mem: story.mem, sceneNo: story.scenes.length + 1, lastQ: story.scenes.at(-1)?.q } }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.status === 429) return setMsg("Limit scen na dziś wykorzystany – wróć jutro.");
    if (!r.ok) return setMsg("Błąd – spróbuj ponownie.");
    const sc = story.scenes.map((x: any, i: number) => (i === story.scenes.length - 1 ? { ...x, choice } : x));
    const ns = { ...story, scenes: [...sc, { ...j.scene, n: sc.length + 1 }], mem: j.mem, ended: j.scene.end, view: sc.length };
    setS(ns); await sb.from("stories").upsert({ id: ns.id, user_id: uid, data: ns, updated_at: new Date().toISOString() });
  }
  const start = () => { if (!f.hero.trim()) return setMsg("Podaj imię bohatera."); gen({ id: crypto.randomUUID(), ...f, hero: f.hero.trim(), trait: "", scenes: [], mem: { facts: [], threads: [], summary: "" } }, null); };
  if (!configured) return <div className="w"><h1>AI COMIC</h1><div className="card"><p>Brak konfiguracji: ustaw NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY w ustawieniach hostingu i wdróż ponownie.</p></div></div>;
  if (!uid) return <div className="w"><h1>AI COMIC</h1><div className="card"><p>Ty decydujesz, co dalej. Zaloguj się e-mailem (bez hasła), żeby zapisywać historie.</p>
    <input type="email" placeholder="twój e-mail" value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn" onClick={login}>Wyślij link</button><p className="mut">{msg}</p></div></div>;
  const sc = s?.scenes[s.view], last = s && s.view === s.scenes.length - 1;
  return <div className="w"><div className="mut" style={{ display: "flex", justifyContent: "space-between" }}><b>AI COMIC</b><a onClick={() => sb.auth.signOut()}>Wyloguj</a></div>
    {!s && <><div className="card"><h2>Nowa historia</h2><label>Bohater</label><input maxLength={30} value={f.hero} onChange={(e) => setF({ ...f, hero: e.target.value })} />
      <label>Gatunek</label><select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select>
      <label>Pomysł (opcjonalnie)</label><textarea rows={3} maxLength={200} value={f.idea} onChange={(e) => setF({ ...f, idea: e.target.value })} /><button className="btn" disabled={busy} onClick={start}>{busy ? "Piszę…" : "ZACZYNAMY"}</button></div>
      {list.length > 0 && <div className="card"><h2>Moje historie</h2>{list.map((x) => <button key={x.id} className="btn s" onClick={() => setS({ ...x.data, view: x.data.scenes.length - 1 })}>{x.data.hero} · {x.data.genre} · {x.data.scenes.length} scen{x.data.ended ? " ✓" : ""}</button>)}</div>}</>}
    {s && sc && <div><div className="mut">Scena {sc.n}/10 <span className="tag">{sc.mode}</span></div><h2>{sc.title}</h2><Art n={sc.n} hero={s.hero} /><div className="nar">{sc.narr}</div>
      {sc.dlg.map((d: any, i: number) => <div key={i} className="bub"><b>{d.who}</b><br />{d.text}</div>)}<p className="mut">{sc.sit}</p>
      {last && !s.ended && !busy && <><div className="q">{sc.q}</div><div className="yn"><button className="btn y" onClick={() => gen(s, "TAK")}>TAK<br /><small>{sc.yes}</small></button><button className="btn" onClick={() => gen(s, "NIE")}>NIE<br /><small>{sc.no}</small></button></div></>}
      {busy && <div className="q">Piszę kolejną scenę…</div>}
      {s.ended && last && <div className="card"><h2>Koniec</h2>{s.scenes.filter((x: any) => x.choice).map((x: any) => <p key={x.n} className="mut">{x.n}. {x.q} → {x.choice}</p>)}</div>}
      <div className="yn"><button className="btn s" disabled={s.view < 1} onClick={() => setS({ ...s, view: s.view - 1 })}>◀</button><button className="btn s" disabled={last} onClick={() => setS({ ...s, view: s.view + 1 })}>▶</button></div>
      <button className="btn s" onClick={() => setS(null)}>Moje historie</button></div>}
    <p className="mut">{msg}</p></div>;
}
