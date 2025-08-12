import React, { useEffect, useMemo, useRef, useState } from "react";

// Kids‑friendly clustering playground (v2)
// Changes:
// 1) Removed Teacher tips section
// 2) Visible step number (and phase) in UI and title bar
// 3) Checkbox to show previous cluster center position (onion‑skin)

export default function ClusteringPlayground() {
  const W = 960, H = 600;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  type Pt = { x: number; y: number; label?: number; cid?: number; visited?: boolean };
  type Centroid = { x: number; y: number; color: string };

  const colors = ["#ef4444", "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

  // ---------- DATASETS ----------
  type Shape = "blobs" | "moons" | "ring" | "outliers";
  const [shape, setShape] = useState<Shape>("blobs");
  const [seed, setSeed] = useState(1);

  function rng(seed: number) { let s = seed >>> 0; return () => (s = (1664525 * s + 1013904223) >>> 0, (s & 0xfffffff) / 0xfffffff); }

  function genBlobs(rnd: () => number, n = 150): Pt[] {
    const centers = [{ x: 260, y: 320 }, { x: 540, y: 200 }, { x: 720, y: 360 }];
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const c = centers[i % centers.length];
      const a = rnd() * Math.PI * 2; const r = 30 + rnd() * 40;
      pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
    return pts;
  }
  function genMoons(rnd: () => number, n = 200): Pt[] {
    const pts: Pt[] = []; const noise = 0.12;
    for (let i = 0; i < n / 2; i++) { const t = Math.PI * (i / (n / 2)); const x = 300 + 120 * Math.cos(t) + (rnd() - 0.5) * 60 * noise; const y = 320 + 80 * Math.sin(t) + (rnd() - 0.5) * 60 * noise; pts.push({ x, y }); }
    for (let i = 0; i < n / 2; i++) { const t = Math.PI * (i / (n / 2)); const x = 480 + 120 * Math.cos(t) + (rnd() - 0.5) * 60 * noise; const y = 360 - 80 * Math.sin(t) + (rnd() - 0.5) * 60 * noise; pts.push({ x, y }); }
    return pts;
  }
  function genRing(rnd: () => number, n = 200): Pt[] {
    const pts: Pt[] = []; for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2; const r = 120 + rnd() * 10; pts.push({ x: 480 + Math.cos(a) * r, y: 320 + Math.sin(a) * r }); }
    for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2; const r = 35 * Math.sqrt(rnd()); pts.push({ x: 480 + Math.cos(a) * r, y: 320 + Math.sin(a) * r }); }
    return pts;
  }
  function genOutliers(rnd: () => number, n = 200): Pt[] {
    const pts: Pt[] = genBlobs(rnd, n - 10); for (let i = 0; i < 10; i++) pts.push({ x: 60 + rnd() * (W - 120), y: 60 + rnd() * (H - 120) }); return pts;
  }

  const dataset = useMemo(() => { const r = rng(seed); if (shape === "moons") return genMoons(r); if (shape === "ring") return genRing(r); if (shape === "outliers") return genOutliers(r); return genBlobs(r); }, [shape, seed]);
  const [points, setPoints] = useState<Pt[]>(dataset);
  useEffect(() => setPoints(dataset.map(p => ({ ...p }))), [dataset]);

  // ---------- MODES ----------
  type Mode = "kmeans" | "dbscan"; const [mode, setMode] = useState<Mode>("kmeans");

  // ---------- K-MEANS STATE ----------
  const [k, setK] = useState(3);
  const [centroids, setCentroids] = useState<Centroid[]>(initCentroids(points, k));
  const [prevCentroids, setPrevCentroids] = useState<Centroid[] | null>(null); // onion‑skin prev
  const [showOnion, setShowOnion] = useState(false);
  const [auto, setAuto] = useState(false);
  const [stepNum, setStepNum] = useState(0);
  const [showVoronoi, setShowVoronoi] = useState(false);

  function initCentroids(pts: Pt[], kk: number): Centroid[] {
    const res: Centroid[] = []; const r = rng(seed + 42);
    for (let i = 0; i < kk; i++) { const p = pts[Math.floor(r() * pts.length)] || { x: 200 + i * 120, y: 200 + i * 40 }; res.push({ x: p.x, y: p.y, color: colors[i % colors.length] }); }
    return res;
  }

  useEffect(() => { setCentroids(initCentroids(points, k)); setPrevCentroids(null); assignClusters(); setStepNum(0); }, [k, seed, shape]);

  function assignClusters() { setPoints(prev => prev.map(p => ({ ...p, cid: nearestCentroid(p, centroids) }))); }
  function nearestCentroid(p: Pt, cents: Centroid[]) { let best = 0, bestD = Infinity; for (let i = 0; i < cents.length; i++) { const c = cents[i]; const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < bestD) { bestD = d; best = i; } } return best; }

  function recomputeCentroids() {
    const sums: { x: number; y: number; n: number }[] = Array.from({ length: centroids.length }, () => ({ x: 0, y: 0, n: 0 }));
    for (const p of points) { if (p.cid == null) continue; const s = sums[p.cid]; s.x += p.x; s.y += p.y; s.n += 1; }
    const next = centroids.map((c, i) => sums[i].n ? { ...c, x: sums[i].x / sums[i].n, y: sums[i].y / sums[i].n } : c);
    setPrevCentroids(centroids.map(c => ({ ...c })));
    setCentroids(next);
  }

  // Auto runner
  useEffect(() => {
    if (!auto || mode !== "kmeans") return; const id = setInterval(() => {
      setStepNum(n => { const next = n + 1; if (next % 2 === 1) assignClusters(); else recomputeCentroids(); return next; });
    }, 700); return () => clearInterval(id);
  }, [auto, mode]);

  // ---------- DBSCAN ----------
  const [eps, setEps] = useState(38); const [minPts, setMinPts] = useState(5);
  const [dbscanResult, setDbscanResult] = useState<{ labels: number[]; core: boolean[] } | null>(null);
  function runDBSCAN() {
    const n = points.length; const labels = Array(n).fill(-99); const core = Array(n).fill(false);
    const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2; const eps2 = eps * eps;
    const neigh: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (dist2(points[i], points[j]) <= eps2) { neigh[i].push(j); neigh[j].push(i); }
    for (let i = 0; i < n; i++) core[i] = (neigh[i].length + 1) >= minPts;
    let cid = 0; for (let i = 0; i < n; i++) { if (labels[i] !== -99) continue; if (!core[i]) { labels[i] = -1; continue; } labels[i] = cid; const q = [i]; for (let qi = 0; qi < q.length; qi++) { const p = q[qi]; for (const nb of neigh[p]) { if (labels[nb] === -99) { labels[nb] = cid; if (core[nb]) q.push(nb); } } } cid++; }
    setDbscanResult({ labels, core });
  }
  useEffect(() => { if (mode === "dbscan") runDBSCAN(); }, [mode]);
  useEffect(() => { if (mode === "dbscan") runDBSCAN(); }, [eps, minPts, points]);

  // ---------- DRAW ----------
  useEffect(() => {
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#f8fafc"); g.addColorStop(1, "#eef2ff"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    if (mode === "kmeans" && showVoronoi && centroids.length) {
      const step = 8;
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        let best = 0, bestD = Infinity; for (let i = 0; i < centroids.length; i++) { const c = centroids[i]; const d = (x - c.x) ** 2 + (y - c.y) ** 2; if (d < bestD) { bestD = d; best = i; } }
        ctx.fillStyle = hexToRgba(colors[best % colors.length], 0.08); ctx.fillRect(x, y, step, step);
      }
    }

    if (mode === "kmeans") {
      for (const p of points) { const col = p.cid == null ? "#334155" : colors[p.cid % colors.length]; drawPoint(ctx, p.x, p.y, 5, col, 0.9); }
      if (showOnion && prevCentroids) { for (let i = 0; i < prevCentroids.length; i++) { const c = prevCentroids[i]; drawCentroidGhost(ctx, c.x, c.y, colors[i % colors.length]); } }
      for (let i = 0; i < centroids.length; i++) { const c = centroids[i]; drawCentroid(ctx, c.x, c.y, c.color); }
    } else {
      const labels = dbscanResult?.labels || []; const core = dbscanResult?.core || [];
      for (let i = 0; i < points.length; i++) { const p = points[i]; const lb = labels[i] ?? -1; if (lb === -1) drawPoint(ctx, p.x, p.y, 4, "#111827", 0.6); else { const col = colors[lb % colors.length]; drawPoint(ctx, p.x, p.y, core[i] ? 6 : 4, col, core[i] ? 1 : 0.8, core[i] ? 1.0 : 0.7); } }
      if (hoverPt) { ctx.strokeStyle = "#64748b"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(hoverPt.x, hoverPt.y, eps, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }

    ctx.fillStyle = "#111827"; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, W, 36); ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff"; ctx.font = "600 16px ui-sans-serif, system-ui";
    const phase = mode === "kmeans" ? `Step ${stepNum} • ${stepNum % 2 === 0 ? "Assign to nearest" : "Move centers"}` : "DBSCAN: group by neighborhood (eps & minPts)";
    ctx.fillText(mode === "kmeans" ? `K‑Means: ${phase}` : phase, 12, 24);
  }, [points, centroids, mode, dbscanResult, showVoronoi, eps, stepNum, showOnion, prevCentroids]);

  function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1, strokeAlpha = 0.9) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = strokeAlpha; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
  function drawCentroid(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const ang = (-Math.PI / 2) + i * (2 * Math.PI / 5); const ox = Math.cos(ang) * 12; const oy = Math.sin(ang) * 12; if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy); const ang2 = ang + Math.PI / 5; ctx.lineTo(Math.cos(ang2) * 6, Math.sin(ang2) * 6); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawCentroidGhost(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = color; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const ang = (-Math.PI / 2) + i * (2 * Math.PI / 5); const ox = Math.cos(ang) * 12; const oy = Math.sin(ang) * 12; if (i === 0) ctx.moveTo(x + ox, y + oy); else ctx.lineTo(x + ox, y + oy); const ang2 = ang + Math.PI / 5; ctx.lineTo(x + Math.cos(ang2) * 6, y + Math.sin(ang2) * 6); }
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  function hexToRgba(hex: string, a: number) { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)!; const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16); return `rgba(${r},${g},${b},${a})`; }

  // ---------- MOUSE & INTERACTION ----------
  const [dragIdx, setDragIdx] = useState<number | null>(null); const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current!; const rel = (e: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) }; };
    const onMove = (e: PointerEvent) => { const { x, y } = rel(e); if (mode === "kmeans" && dragIdx != null) { setCentroids(prev => prev.map((c, i) => i === dragIdx ? { ...c, x, y } : c)); assignClusters(); return; } if (mode === "dbscan") { let best: Pt | null = null, bestD = 400; for (const p of points) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bestD) { bestD = d; best = p; } } setHoverPt(best); } };
    const onDown = (e: PointerEvent) => { const { x, y } = rel(e); if (mode === "kmeans") for (let i = 0; i < centroids.length; i++) { const c = centroids[i]; if ((c.x - x) ** 2 + (c.y - y) ** 2 < 18 ** 2) { setDragIdx(i); return; } } };
    const onUp = () => { setDragIdx(null); };
    const onClick = (e: PointerEvent) => { const { x, y } = rel(e); if (e.shiftKey) { let idx = -1, best = Infinity; for (let i = 0; i < points.length; i++) { const p = points[i]; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < best) { best = d; idx = i; } } if (idx >= 0) setPoints(prev => prev.filter((_, i) => i !== idx)); } else { setPoints(prev => [...prev, { x, y }]); } };
    canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("click", onClick);
    return () => { canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("click", onClick); };
  }, [centroids, points, mode, dragIdx]);

  // ---------- UI HELPERS ----------
  function resetKMeans() { setCentroids(initCentroids(points, k)); setPrevCentroids(null); setAuto(false); setStepNum(0); assignClusters(); }
  function stepKMeans() { setStepNum(n => { const next = n + 1; if (next % 2 === 1) assignClusters(); else recomputeCentroids(); return next; }); }
  function resetDataset() { setSeed(s => s + 1); }

  return (
    <div className="w-full min-h-[100vh] bg-gradient-to-b from-indigo-50 to-white p-4 flex flex-col items-center gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Clustering Playground</h1>
      <p className="text-gray-700 -mt-2">A hands‑on way to teach kids how grouping works, two different ways.</p>

      <div className="flex flex-wrap items-center gap-2">
        <ModeToggle mode={mode} setMode={m => { setMode(m); setAuto(false); }} />
        <div className="h-6 w-px bg-gray-300" />
        <DatasetPicker shape={shape} setShape={s => { setShape(s); setSeed(x => x + 1); }} />
        <button className="px-3 py-1.5 rounded-xl bg-gray-900 text-white hover:opacity-90" onClick={resetDataset}>Shuffle dataset</button>
        <span className="text-gray-500 text-sm">Click to add points • Shift+Click to remove</span>
      </div>

      <div className="w-full max-w-[1000px] rounded-2xl shadow-lg bg-white p-3">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {mode === "kmeans" ? (
            <>
              <label className="flex items-center gap-2">K
                <input className="ml-1" type="range" min={1} max={6} value={k} onChange={e => setK(parseInt(e.target.value))} />
                <span className="w-6 text-center font-medium">{k}</span>
              </label>
              <button className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white" onClick={stepKMeans}>Step</button>
              <button className={`px-3 py-1.5 rounded-xl ${auto ? "bg-rose-600" : "bg-emerald-600"} text-white`} onClick={() => setAuto(a => !a)}>{auto ? "Stop" : "Auto"}</button>
              <button className="px-3 py-1.5 rounded-xl bg-gray-800 text-white" onClick={resetKMeans}>Reset K‑Means</button>
              <label className="flex items-center gap-2 ml-2 text-sm">
                <input type="checkbox" checked={showVoronoi} onChange={e => setShowVoronoi(e.target.checked)} />
                Show colored regions
              </label>
              <label className="flex items-center gap-2 ml-2 text-sm">
                <input type="checkbox" checked={showOnion} onChange={e => setShowOnion(e.target.checked)} />
                Show previous centers
              </label>
              <span className="ml-2 text-sm text-gray-700">Step: <span className="font-semibold">{stepNum}</span> <span className="text-gray-500">({stepNum % 2 === 0 ? 'Assign to nearest' : 'Move centers'})</span></span>
              <div className="text-gray-500 text-sm">Drag the ⭐️ stars; points join the closest star.</div>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2">ε
                <input type="range" min={10} max={100} value={eps} onChange={e => setEps(parseInt(e.target.value))} />
                <span className="w-10 text-center font-medium">{eps}</span>
              </label>
              <label className="flex items-center gap-2">minPts
                <input type="range" min={2} max={12} value={minPts} onChange={e => setMinPts(parseInt(e.target.value))} />
                <span className="w-8 text-center font-medium">{minPts}</span>
              </label>
              <button className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white" onClick={runDBSCAN}>Recompute</button>
              <div className="text-gray-500 text-sm">Core points are bigger dots. Noise is black.</div>
            </>
          )}
        </div>
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-xl border border-gray-200" />
          <div className="absolute top-2 right-2 bg-white/80 backdrop-blur rounded-xl px-3 py-2 shadow text-sm">
            {mode === "kmeans" ? (
              <div className="space-y-1">
                <div><span className="font-medium">K‑Means</span>: "closest star" rule</div>
                <div>Step 1: Assign → Step 2: Move stars to the middle → repeat</div>
              </div>
            ) : (
              <div className="space-y-1">
                <div><span className="font-medium">DBSCAN</span>: "friends within ε" form groups</div>
                <div>Big = core (has ≥ minPts friends). Small near cores join. Alone = noise.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-1 gap-4 max-w-[1000px]">
        <Card title="Mini challenges">
          <ol className="list-decimal pl-5 space-y-2 text-gray-700">
            <li>Make three tidy groups using K‑Means. How many steps did it take?</li>
            <li>Switch to Moons. Can K‑Means separate them nicely? Why or why not?</li>
            <li>Use DBSCAN on Moons. Find ε and minPts that detect the two moons with no noise.</li>
            <li>Create a smiley face with points. Which method finds the eyes and mouth better?</li>
            <li>Add outliers. Which method is more <i>robust</i> to those loners?</li>
          </ol>
        </Card>
      </div>

      <div className="text-xs text-gray-500">Tip: Project this in class and let students take turns driving the controls.</div>
    </div>
  );

  // ---------- SMALL UI PIECES ----------
  function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
    return (
      <div className="inline-flex rounded-2xl bg-gray-100 p-1">
        <button onClick={() => setMode("kmeans")} className={`px-4 py-1.5 rounded-xl ${mode === "kmeans" ? "bg-white shadow font-medium" : "text-gray-600"}`}>K‑Means</button>
        <button onClick={() => setMode("dbscan")} className={`px-4 py-1.5 rounded-xl ${mode === "dbscan" ? "bg-white shadow font-medium" : "text-gray-600"}`}>DBSCAN</button>
      </div>
    );
  }
  function DatasetPicker({ shape, setShape }: { shape: Shape; setShape: (s: Shape) => void }) {
    const opts: { key: Shape; label: string }[] = [
      { key: "blobs", label: "Blobs" },
      { key: "moons", label: "Two Moons" },
      { key: "ring", label: "Ring + Blob" },
      { key: "outliers", label: "Sprinkle + Outliers" },
    ];
    return (
      <div className="inline-flex rounded-2xl bg-gray-100 p-1">
        {opts.map(o => (
          <button key={o.key} onClick={() => setShape(o.key)} className={`px-3 py-1.5 rounded-xl ${shape === o.key ? "bg-white shadow font-medium" : "text-gray-600"}`}>{o.label}</button>
        ))}
      </div>
    );
  }
  function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="font-semibold mb-2">{title}</div>
        <div>{children}</div>
      </div>
    );
  }
}
