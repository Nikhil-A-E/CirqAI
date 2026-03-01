import { useState, useMemo, useRef } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts"

const API_URL = import.meta.env.VITE_API_URL
  || "http://localhost:8000"

const COLORS = [
  "#00ff9d", "#00b4ff", "#f59e0b",
  "#a78bfa", "#fb7185", "#34d399"
]

const SUPPLY_KEYWORDS = [
  'vcc', 'vdd', 'vee', 'vss', 'v5', 'v12',
  'v15', 'v33', 'v24', 'v9', 'supply', 'power', 'rail'
]
const isSupply = key =>
  SUPPLY_KEYWORDS.some(k => key.toLowerCase().includes(k))

function buildPlotOptions(results) {
  const options = []
  if (!results) return options
  if (results.tran?.length > 0) {
    const nodeKeys = Object.keys(results.tran[0] || {})
      .filter(k => k !== "time" && !isSupply(k))
    nodeKeys.forEach(node => {
      options.push({
        id: `tran_${node}`, label: `Time vs ${node}`,
        xKey: "time", yKey: node, data: results.tran,
        xLabel: "Time (ms)", yLabel: "Voltage (V)",
        type: "tran"
      })
    })
    for (let i = 0; i < nodeKeys.length; i++) {
      for (let j = 0; j < nodeKeys.length; j++) {
        if (i === j) continue
        options.push({
          id: `xy_${nodeKeys[i]}_${nodeKeys[j]}`,
          label: `${nodeKeys[i]} vs ${nodeKeys[j]}`,
          xKey: nodeKeys[i], yKey: nodeKeys[j],
          data: results.tran,
          xLabel: `${nodeKeys[i]} (V)`,
          yLabel: `${nodeKeys[j]} (V)`,
          type: "xy"
        })
      }
    }
  }
  if (results.ac?.length > 0) {
    const isFft = results.ac[0]?._is_fft
    Object.keys(results.ac[0] || {})
      .filter(k => k.endsWith('_db') &&
        !isSupply(k.replace('_db', '')))
      .forEach(key => {
        options.push({
          id: `bode_${key}`,
          label: `Freq vs ${key.replace('_db', '')} (dB)`,
          xKey: "freq", yKey: key, data: results.ac,
          xLabel: "Frequency (Hz)", yLabel: "Magnitude (dB)",
          type: "bode", isFft
        })
      })
    Object.keys(results.ac[0] || {})
      .filter(k => k.endsWith('_mag') &&
        !isSupply(k.replace('_mag', '')))
      .forEach(key => {
        options.push({
          id: `lin_${key}`,
          label: `Freq vs ${key.replace('_mag', '')} (linear)`,
          xKey: "freq", yKey: key, data: results.ac,
          xLabel: "Frequency (Hz)", yLabel: "Magnitude",
          type: "ac_linear", isFft
        })
      })
  }
  return options
}

function computeParams(results) {
  const params = []
  if (!results) return params
  if (results.ac?.length > 0) {
    const dbKeys = Object.keys(results.ac[0] || {})
      .filter(k => k.endsWith('_db') &&
        !isSupply(k.replace('_db', '')))
    if (dbKeys.length) {
      const key = dbKeys[0]
      const maxDb = Math.max(
        ...results.ac.map(r => r[key] ?? -Infinity))
      const cutoff = results.ac.find(
        r => r[key] <= maxDb - 3)
      if (cutoff) {
        const f = cutoff.freq
        params.push({
          icon: "📐", name: "Cutoff Frequency (-3dB)",
          value: f >= 1e6
            ? `${(f / 1e6).toFixed(3)} MHz`
            : f >= 1000
              ? `${(f / 1000).toFixed(2)} kHz`
              : `${f.toFixed(1)} Hz`,
          unit: ""
        })
      }
      params.push({
        icon: "📊", name: "Passband Gain",
        value: maxDb.toFixed(2), unit: "dB"
      })
    }
  }
  if (results.tran?.length > 0) {
    const sigKeys = Object.keys(results.tran[0] || {})
      .filter(k => k !== "time" && !isSupply(k))
    sigKeys.forEach(key => {
      const vals = results.tran.map(r => r[key] ?? 0)
      const peak = Math.max(...vals.map(Math.abs))
      const mn = Math.min(...vals)
      const mx = Math.max(...vals)
      params.push({
        icon: "⚡", name: `${key} Peak`,
        value: peak.toFixed(4), unit: "V"
      })
      params.push({
        icon: "↕", name: `${key} Range`,
        value: `${mn.toFixed(3)} → ${mx.toFixed(3)}`,
        unit: "V"
      })
    })
  }
  if (results.op?.length > 0) {
    results.op.filter(r => !isSupply(r.node))
      .forEach(r => params.push({
        icon: "🔋", name: `DC ${r.node}`,
        value: String(r.value), unit: r.unit
      }))
  }
  return params
}

// Shared chart styles
const CHART_STYLE = {
  contentStyle: {
    background: "var(--bg2)",
    border: "1px solid var(--border2)",
    borderRadius: 6, fontSize: 11,
    fontFamily: "var(--font-mono)",
    color: "var(--text)"
  }
}

const AXIS_TICK = { fill: "var(--text3)", fontSize: 10, fontFamily: "var(--font-mono)" }
const AXIS_LABEL = { fill: "var(--text3)", fontSize: 11, fontFamily: "var(--font-mono)" }

function SectionHeader({ children, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      gap: 10, marginBottom: 14
    }}>
      <div style={{
        width: 3, height: 16,
        background: color || "var(--green)",
        borderRadius: 2,
        boxShadow: `0 0 8px ${color || "var(--green)"}`
      }} />
      <span style={{
        fontFamily: "var(--font-head)",
        fontSize: 13, fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "0.02em"
      }}>
        {children}
      </span>
    </div>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "18px 20px",
      marginBottom: 16,
      ...style
    }}>
      {children}
    </div>
  )
}

export default function SimulationPanel({ circuit }) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [hiddenNodes, setHiddenNodes] = useState(new Set())
  const [hoverX, setHoverX] = useState(null)
  const [hoverData, setHoverData] = useState(null)
  const [lockedX, setLockedX] = useState(null)
  const [lockedData, setLockedData] = useState(null)
  const [selectedPlotId, setSelectedPlotId] = useState(null)
  const lastHoverRef = useRef(null)
  const isLockedRef = useRef(false)
  const [manualTime, setManualTime] = useState("")
  const [manualValues, setManualValues] = useState(null)

  function lookupAtTime(t) {
    if (!results?.tran?.length) return
    const target = parseFloat(t)
    if (isNaN(target)) return

    // Find closest time point in tran data
    let closest = results.tran[0]
    let minDiff = Infinity
    for (const row of results.tran) {
      const diff = Math.abs(row.time - target)
      if (diff < minDiff) {
        minDiff = diff
        closest = row
      }
    }

    // Build values array from that row
    const vals = Object.entries(closest)
      .filter(([k]) => k !== "time" && !isSupply(k))
      .map(([k, v], i) => ({
        name: k,
        value: v,
        color: COLORS[i % COLORS.length]
      }))
    setManualValues({ t: closest.time, vals })
  }

  function downloadPlotsCSV() {
    if (!results) return
    let csv = ""
    if (results.tran?.length > 0) {
      csv += "--- Transient Analysis ---\n"
      const keys = Object.keys(results.tran[0])
      csv += keys.join(",") + "\n"
      results.tran.forEach(row => {
        csv += keys.map(k => row[k]).join(",") + "\n"
      })
      csv += "\n"
    }
    if (results.ac?.length > 0) {
      csv += "--- AC Analysis ---\n"
      const keys = Object.keys(results.ac[0])
      csv += keys.join(",") + "\n"
      results.ac.forEach(row => {
        csv += keys.map(k => row[k]).join(",") + "\n"
      })
      csv += "\n"
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(circuit?.circuit_name || "circuit").replace(/\s+/g, '_')}_plots.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const netlist = circuit?.spice_netlist
  const activeX = lockedX ?? hoverX
  const activeData = lockedData ?? hoverData

  async function runSimulation() {
    if (!netlist) return
    setLoading(true); setError(null); setResults(null)
    setHiddenNodes(new Set())
    setHoverX(null); setHoverData(null)
    setLockedX(null); setLockedData(null)
    setSelectedPlotId(null)
    try {
      const res = await fetch(`${API_URL}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          netlist,
          circuit_name: circuit?.circuit_name || "Circuit"
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      if (!data.success) throw new Error(data.error)
      setResults(data.results)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleNode = key => {
    const next = new Set(hiddenNodes)
    next.has(key) ? next.delete(key) : next.add(key)
    setHiddenNodes(next)
  }

  const plotOptions = useMemo(
    () => buildPlotOptions(results), [results])
  const circuitParams = useMemo(
    () => computeParams(results), [results])

  useMemo(() => {
    if (plotOptions.length > 0 && !selectedPlotId) {
      const bode = plotOptions.find(p => p.type === 'bode')
      setSelectedPlotId(bode
        ? bode.id : plotOptions[0]?.id)
    }
  }, [plotOptions])

  const selectedPlot = plotOptions.find(
    p => p.id === selectedPlotId)

  if (!netlist) return null

  return (
    <div style={{ fontFamily: "var(--font-mono)" }}>

      {/* Run button */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 16
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8
        }}>
          <div style={{
            width: 3, height: 20,
            background: "var(--green)",
            borderRadius: 2,
            boxShadow: "0 0 10px var(--green)"
          }} />
          <span style={{
            fontFamily: "var(--font-head)",
            fontSize: 15, fontWeight: 700,
            color: "var(--text)"
          }}>
            SPICE Simulation
          </span>
        </div>
        <button onClick={runSimulation} disabled={loading}
          style={{
            background: loading
              ? "var(--bg3)" : "var(--green)",
            color: loading ? "var(--text3)" : "#080c0e",
            border: "none", borderRadius: 8,
            padding: "8px 20px",
            fontFamily: "var(--font-mono)",
            fontSize: 12, fontWeight: 600,
            letterSpacing: "0.05em",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading
              ? "none"
              : "0 0 20px rgba(0,255,157,0.3)",
            display: "flex", alignItems: "center", gap: 8,
            transition: "all 0.2s"
          }}>
          {loading ? (
            <>
              <span style={{
                display: "inline-block",
                width: 10, height: 10,
                border: "2px solid var(--text3)",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite"
              }} />
              <style>{`
                @keyframes spin{to{transform:rotate(360deg)}}
              `}</style>
              Simulating...
            </>
          ) : "▶ Run Simulation"}
        </button>

        {results && (
          <button onClick={downloadPlotsCSV}
            style={{
              background: "transparent",
              color: "var(--text3)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "7px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.15s"
            }}
            onMouseEnter={e => {
              e.target.style.color = "var(--green)"
              e.target.style.borderColor = "var(--green-dim)"
            }}
            onMouseLeave={e => {
              e.target.style.color = "var(--text3)"
              e.target.style.borderColor = "var(--border)"
            }}>
            ⬇ Download Data (CSV)
          </button>
        )}
      </div>

      {error && (
        <div style={{
          background: "rgba(255,68,102,0.08)",
          border: "1px solid rgba(255,68,102,0.3)",
          borderRadius: 8, padding: "10px 14px",
          color: "#ff4466", fontSize: 12, marginBottom: 16
        }}>⚠ {error}</div>
      )}

      {!results && !loading && (
        <div style={{
          textAlign: "center", padding: "60px 40px",
          color: "var(--text3)"
        }}>
          <div style={{
            fontSize: 32, marginBottom: 12,
            opacity: 0.4
          }}>📡</div>
          <p style={{ fontSize: 12 }}>
            Click Run Simulation to begin SPICE analysis
          </p>
        </div>
      )}

      {results && (
        <>
          {/* ══ PANEL 1: TRANSIENT ══ */}
          {results.tran?.length > 0 && (() => {
            const allKeys = Object.keys(
              results.tran[0] || {})
              .filter(k => k !== "time" && !isSupply(k))
            return (
              <Panel>
                <SectionHeader color="var(--green)">
                  Transient Analysis
                </SectionHeader>

                <div style={{
                  display: "flex", gap: 8,
                  justifyContent: "space-between",
                  alignItems: "center", marginBottom: 10,
                  flexWrap: "wrap"
                }}>
                  {/* Node toggles */}
                  <div style={{
                    display: "flex", gap: 6,
                    flexWrap: "wrap"
                  }}>
                    {allKeys.map((key, i) => (
                      <button key={key}
                        onClick={() => toggleNode(key)}
                        style={{
                          background: hiddenNodes.has(key)
                            ? "transparent"
                            : `${COLORS[i % COLORS.length]}22`,
                          color: hiddenNodes.has(key)
                            ? "var(--text3)"
                            : COLORS[i % COLORS.length],
                          border: `1px solid ${hiddenNodes.has(key)
                            ? "var(--border)"
                            : COLORS[i % COLORS.length]}`,
                          borderRadius: 6,
                          padding: "3px 10px",
                          cursor: "pointer",
                          fontSize: 11, fontWeight: 600,
                          fontFamily: "var(--font-mono)",
                          transition: "all 0.15s"
                        }}>
                        {key}
                      </button>
                    ))}
                  </div>

                  {lockedX !== null && (
                    <button onClick={() => {
                      isLockedRef.current = false
                      setLockedX(null)
                      setLockedData(null)
                    }}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(0,255,157,0.4)",
                        borderRadius: 6,
                        color: "var(--green)",
                        padding: "3px 10px",
                        cursor: "pointer", fontSize: 11,
                        fontFamily: "var(--font-mono)"
                      }}>
                      ✕ Unlock
                    </button>
                  )}
                </div>

                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={results.tran}
                    margin={{ top: 8, right: 20, left: 10, bottom: 44 }}
                    onMouseMove={e => {
                      if (isLockedRef.current) return
                      if (e?.activePayload) {
                        setHoverX(e.activeLabel)
                        setHoverData(e.activePayload)
                        lastHoverRef.current = {
                          x: e.activeLabel, data: e.activePayload
                        }
                      }
                    }}
                    onMouseLeave={() => {
                      if (isLockedRef.current) return
                      setHoverX(null)
                      setHoverData(null)
                    }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)" />
                    <XAxis
                      dataKey="time"
                      stroke="var(--border2)"
                      tick={AXIS_TICK}
                      tickFormatter={t =>
                        Number(t).toFixed(2)}
                      label={{
                        ...AXIS_LABEL,
                        value: "Time (ms)",
                        position: "insideBottom",
                        offset: -28
                      }} />
                    <YAxis
                      stroke="var(--border2)"
                      tick={AXIS_TICK}
                      width={45}
                      label={{
                        ...AXIS_LABEL,
                        value: "Voltage (V)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 10
                      }} />
                    <Tooltip
                      contentStyle={
                        CHART_STYLE.contentStyle}
                      labelStyle={{
                        color: "var(--text2)",
                        marginBottom: 4
                      }}
                      labelFormatter={t =>
                        `t = ${Number(t).toFixed(4)} ms`}
                      formatter={(val, name) => [
                        `${Number(val).toFixed(4)} V`,
                        name
                      ]} />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        paddingTop: 4
                      }} />

                    {hoverX !== null && !lockedX && (
                      <ReferenceLine x={hoverX}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={1}
                        strokeDasharray="4 4" />
                    )}
                    {lockedX !== null && (
                      <ReferenceLine x={lockedX}
                        stroke="var(--green)"
                        strokeWidth={2}
                        label={{
                          value: `📍${Number(lockedX)
                            .toFixed(2)}ms`,
                          fill: "var(--green)",
                          fontSize: 10,
                          position: "insideTopLeft",
                          fontFamily: "var(--font-mono)"
                        }} />
                    )}

                    {allKeys
                      .filter(k => !hiddenNodes.has(k))
                      .map((key, i) => (
                        <Line key={key} type="monotone"
                          dataKey={key}
                          stroke={COLORS[i % COLORS.length]}
                          dot={false} strokeWidth={1.8}
                          name={key}
                          style={{
                            filter: `drop-shadow(0 0 3px ${COLORS[i % COLORS.length]}60)`
                          }} />
                      ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* Live values strip */}
                {
                  activeData && (
                    <div style={{
                      display: "flex", gap: 12,
                      marginTop: 10, padding: "10px 14px",
                      background: lockedX
                        ? "rgba(0,255,157,0.05)"
                        : "var(--bg)",
                      borderRadius: 8,
                      border: `1px solid ${lockedX
                        ? "rgba(0,255,157,0.3)"
                        : "var(--border)"}`,
                      flexWrap: "wrap",
                      alignItems: "center"
                    }}>
                      {lockedX && (
                        <span style={{
                          fontSize: 9,
                          color: "var(--green)",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 2
                        }}>📍 LOCKED</span>
                      )}
                      <span style={{
                        color: "var(--text3)",
                        fontSize: 11
                      }}>
                        t = {Number(activeX).toFixed(4)} ms
                      </span>
                      {activeData
                        .filter(e => !isSupply(e.name))
                        .map((entry, i) => (
                          <div key={i} style={{
                            display: "flex",
                            alignItems: "center", gap: 6
                          }}>
                            <div style={{
                              width: 8, height: 8,
                              borderRadius: "50%",
                              background: entry.color,
                              boxShadow: `0 0 6px ${entry.color}`
                            }} />
                            <span style={{
                              color: "var(--text2)",
                              fontSize: 11
                            }}>
                              {entry.name}:
                            </span>
                            <span style={{
                              color: entry.color,
                              fontSize: 12, fontWeight: 600
                            }}>
                              {Number(entry.value)
                                .toFixed(4)} V
                            </span>
                          </div>
                        ))}
                      <button
                        onClick={() => {
                          const last = lastHoverRef.current
                          if (!last) return
                          if (isLockedRef.current) {
                            isLockedRef.current = false
                            setLockedX(null)
                            setLockedData(null)
                          } else {
                            isLockedRef.current = true
                            setLockedX(last.x)
                            setLockedData(last.data)
                          }
                        }}
                        style={{
                          marginLeft: "auto",
                          background: isLockedRef.current
                            ? "rgba(0,255,157,0.15)"
                            : "var(--bg3)",
                          border: `1px solid ${isLockedRef.current
                            ? "var(--green)"
                            : "var(--border2)"}`,
                          borderRadius: 6,
                          color: isLockedRef.current
                            ? "var(--green)" : "var(--text3)",
                          padding: "4px 12px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600
                        }}>
                        {isLockedRef.current ? "🔓 Unlock" : "📍 Lock"}
                      </button>
                    </div>
                  )
                }
              </Panel>
            )
          })()}

          {/* ══ PANEL 2: ANALYSIS / AC ══ */}
          <Panel>
            <SectionHeader color="var(--blue)">
              Signal Analysis
            </SectionHeader>

            {plotOptions.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "30px 20px",
                color: "var(--text3)", fontSize: 12
              }}>
                No analysis data available
              </div>
            ) : (
              <>
                {/* Plot selector chips */}
                <div style={{
                  display: "flex", flexWrap: "wrap",
                  gap: 6, marginBottom: 14
                }}>
                  {plotOptions.map(opt => (
                    <button key={opt.id}
                      onClick={() =>
                        setSelectedPlotId(opt.id)}
                      style={{
                        background:
                          selectedPlotId === opt.id
                            ? "rgba(0,180,255,0.15)"
                            : "var(--bg)",
                        color:
                          selectedPlotId === opt.id
                            ? "var(--blue)"
                            : "var(--text3)",
                        border: `1px solid ${selectedPlotId === opt.id
                          ? "var(--blue)"
                          : "var(--border)"}`,
                        borderRadius: 6,
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        fontWeight:
                          selectedPlotId === opt.id
                            ? 600 : 400,
                        display: "flex",
                        alignItems: "center", gap: 5,
                        transition: "all 0.15s"
                      }}>
                      {opt.type === 'bode' && '📉'}
                      {opt.type === 'tran' && '📈'}
                      {opt.type === 'xy' && '🔀'}
                      {opt.type === 'ac_linear' && '〰'}
                      {" "}{opt.label}
                      {opt.isFft && (
                        <span style={{
                          fontSize: 9,
                          background: "var(--bg3)",
                          color: "var(--text3)",
                          borderRadius: 3,
                          padding: "1px 4px"
                        }}>FFT</span>
                      )}
                    </button>
                  ))}
                </div>

                {selectedPlot?.isFft && (
                  <div style={{
                    background: "rgba(245,158,11,0.07)",
                    border: "1px solid rgba(245,158,11,0.25)",
                    borderRadius: 6, padding: "6px 12px",
                    marginBottom: 10, fontSize: 11,
                    color: "#f59e0b"
                  }}>
                    ℹ FFT of transient data — shape
                    correct, dB values normalized
                  </div>
                )}

                {selectedPlot && (
                  <>
                    <ResponsiveContainer
                      width="100%" height={280}>
                      <LineChart
                        data={selectedPlot.data}
                        margin={{
                          top: 8, right: 20,
                          left: 10, bottom: 44
                        }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)" />
                        <XAxis
                          dataKey={selectedPlot.xKey}
                          stroke="var(--border2)"
                          tick={AXIS_TICK}
                          scale={
                            selectedPlot.type === 'bode' ||
                              selectedPlot.type === 'ac_linear'
                              ? "log" : "auto"}
                          type={
                            selectedPlot.type === 'bode' ||
                              selectedPlot.type === 'ac_linear'
                              ? "number" : "number"}
                          domain={["auto", "auto"]}
                          tickFormatter={val => {
                            if (selectedPlot.type === 'bode' ||
                              selectedPlot.type ===
                              'ac_linear') {
                              if (val >= 1e6)
                                return `${(val / 1e6)
                                  .toFixed(1)}M`
                              if (val >= 1e3)
                                return `${(val / 1e3)
                                  .toFixed(1)}k`
                              return `${Number(val)
                                .toFixed(0)}`
                            }
                            return Number(val).toFixed(2)
                          }}
                          label={{
                            ...AXIS_LABEL,
                            value: selectedPlot.xLabel,
                            position: "insideBottom",
                            offset: -28
                          }} />
                        <YAxis
                          stroke="var(--border2)"
                          tick={AXIS_TICK}
                          width={45}
                          label={{
                            ...AXIS_LABEL,
                            value: selectedPlot.yLabel,
                            angle: -90,
                            position: "insideLeft",
                            offset: 10
                          }} />
                        <Tooltip
                          contentStyle={
                            CHART_STYLE.contentStyle}
                          labelStyle={{
                            color: "var(--text2)",
                            marginBottom: 4
                          }}
                          labelFormatter={val => {
                            if (selectedPlot.type === 'bode' ||
                              selectedPlot.type ===
                              'ac_linear') {
                              if (val >= 1e6)
                                return `${(val / 1e6)
                                  .toFixed(2)} MHz`
                              if (val >= 1e3)
                                return `${(val / 1e3)
                                  .toFixed(2)} kHz`
                              return `${Number(val)
                                .toFixed(1)} Hz`
                            }
                            return `${selectedPlot.xKey
                              }: ${Number(val).toFixed(4)}`
                          }}
                          formatter={(val, name) => [
                            `${Number(val).toFixed(3)}`,
                            name.replace('_db', '')
                              .replace('_mag', '')
                          ]} />
                        <Legend wrapperStyle={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          paddingTop: 4
                        }} />

                        {selectedPlot.type === 'bode' && (
                          <ReferenceLine y={-3}
                            stroke="rgba(0,180,255,0.5)"
                            strokeDasharray="5 5"
                            label={{
                              value: "-3dB",
                              fill: "var(--blue)",
                              fontSize: 10,
                              position: "insideTopRight",
                              fontFamily: "var(--font-mono)"
                            }} />
                        )}

                        <Line
                          type="monotone"
                          dataKey={selectedPlot.yKey}
                          stroke="var(--blue)"
                          dot={false}
                          strokeWidth={2}
                          name={selectedPlot.yKey
                            .replace('_db', '')
                            .replace('_mag', '')}
                          style={{
                            filter: "drop-shadow(0 0 4px rgba(0,180,255,0.5))"
                          }} />
                      </LineChart>
                    </ResponsiveContainer>

                    {selectedPlot.type === 'bode' && (() => {
                      const key = selectedPlot.yKey
                      const data = selectedPlot.data
                      const maxDb = Math.max(
                        ...data.map(r => r[key] ?? -Infinity))
                      const cutoff = data.find(
                        r => r[key] <= maxDb - 3)
                      if (!cutoff) return null
                      const f = cutoff[selectedPlot.xKey]
                      const label = f >= 1e6
                        ? `${(f / 1e6).toFixed(2)} MHz`
                        : f >= 1000
                          ? `${(f / 1000).toFixed(1)} kHz`
                          : `${f.toFixed(0)} Hz`
                      return (
                        <p style={{
                          color: "var(--blue)",
                          fontSize: 12,
                          textAlign: "center",
                          marginTop: 10,
                          fontWeight: 600
                        }}>
                          ⚡ -3dB Cutoff: {label}
                        </p>
                      )
                    })()}
                  </>
                )}
              </>
            )}
          </Panel>

          {/* ══ PANEL 3: PARAMETERS ══ */}
          <Panel>
            <SectionHeader color="#a78bfa">
              Parameters
            </SectionHeader>

            {results?.tran?.length > 0 && (
              <div style={{
                background: "var(--bg)",
                border: "1px solid var(--border2)",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 16
              }}>
                <div style={{
                  fontSize: 10,
                  color: "var(--text3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 10
                }}>
                  🕐 Lookup values at time
                </div>

                <div style={{
                  display: "flex", gap: 8, alignItems: "center"
                }}>
                  <input
                    type="number"
                    value={manualTime}
                    onChange={e => setManualTime(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter")
                        lookupAtTime(manualTime)
                    }}
                    placeholder="Enter time in ms..."
                    style={{
                      flex: 1,
                      background: "var(--bg2)",
                      border: "1px solid var(--border2)",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      padding: "7px 12px",
                      outline: "none"
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "var(--green-dim)"
                      e.target.style.boxShadow =
                        "0 0 0 2px var(--green-glow)"
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "var(--border2)"
                      e.target.style.boxShadow = "none"
                    }}
                  />
                  <button
                    onClick={() => lookupAtTime(manualTime)}
                    style={{
                      background: "var(--green)",
                      color: "#080c0e",
                      border: "none",
                      borderRadius: 6,
                      padding: "7px 16px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      boxShadow: "0 0 12px var(--green-glow)"
                    }}>
                    ↵ Lookup
                  </button>
                  {manualValues && (
                    <button
                      onClick={() => setManualValues(null)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--text3)",
                        padding: "7px 10px",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)"
                      }}>
                      ✕
                    </button>
                  )}
                </div>

                {/* Time range hint */}
                {results.tran.length > 0 && (
                  <div style={{
                    fontSize: 10, color: "var(--text3)",
                    marginTop: 6
                  }}>
                    Range: {results.tran[0].time.toFixed(4)} ms
                    → {results.tran[results.tran.length - 1]
                      .time.toFixed(4)} ms
                  </div>
                )}

                {/* Results */}
                {manualValues && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{
                      fontSize: 10, color: "var(--green-dim)",
                      marginBottom: 8,
                      fontWeight: 600
                    }}>
                      Values at t = {manualValues.t.toFixed(4)} ms
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(130px, 1fr))",
                      gap: 8
                    }}>
                      {manualValues.vals.map((v, i) => (
                        <div key={i} style={{
                          background: "var(--bg2)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          border: `1px solid ${v.color}33`
                        }}>
                          <div style={{
                            fontSize: 10,
                            color: v.color,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            marginBottom: 4
                          }}>
                            {v.name}
                          </div>
                          <div style={{
                            color: "var(--text)",
                            fontSize: 18,
                            fontWeight: 700,
                            lineHeight: 1
                          }}>
                            {Number(v.value).toFixed(5)}
                            <span style={{
                              fontSize: 10,
                              color: "var(--text3)",
                              marginLeft: 3,
                              fontWeight: 400
                            }}>V</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Locked time callout */}
            {lockedData && (
              <div style={{
                background: "rgba(0,255,157,0.05)",
                border: "1px solid rgba(0,255,157,0.25)",
                borderRadius: 10, padding: 14,
                marginBottom: 16
              }}>
                <p style={{
                  color: "var(--green)", fontSize: 11,
                  fontWeight: 700, marginBottom: 12,
                  letterSpacing: "0.05em"
                }}>
                  📍 LOCKED t = {Number(lockedX)
                    .toFixed(4)} ms
                </p>
                <div style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill,minmax(140px,1fr))",
                  gap: 8
                }}>
                  {lockedData
                    .filter(e => !isSupply(e.name))
                    .map((entry, i) => (
                      <div key={i} style={{
                        background: "var(--bg)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        border: `1px solid ${entry.color}33`
                      }}>
                        <div style={{
                          color: entry.color,
                          fontSize: 10, fontWeight: 700,
                          marginBottom: 4,
                          textTransform: "uppercase",
                          letterSpacing: 1
                        }}>
                          {entry.name}
                        </div>
                        <div style={{
                          color: "var(--text)",
                          fontSize: 20, fontWeight: 700,
                          lineHeight: 1
                        }}>
                          {Number(entry.value)
                            .toFixed(4)}
                          <span style={{
                            fontSize: 11,
                            color: "var(--text3)",
                            marginLeft: 4,
                            fontWeight: 400
                          }}>V</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Computed params grid */}
            {circuitParams.length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill,minmax(170px,1fr))",
                gap: 8, marginBottom: 16
              }}>
                {circuitParams.map((p, i) => (
                  <div key={i} style={{
                    background: "var(--bg)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    border: "1px solid var(--border)"
                  }}>
                    <div style={{
                      fontSize: 9,
                      color: "var(--text3)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      marginBottom: 6
                    }}>
                      {p.icon} {p.name}
                    </div>
                    <div style={{
                      color: "#a78bfa",
                      fontSize: 16, fontWeight: 700
                    }}>
                      {p.value}
                      {p.unit && (
                        <span style={{
                          fontSize: 11,
                          color: "var(--text3)",
                          marginLeft: 4,
                          fontWeight: 400
                        }}>
                          {p.unit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{
                color: "var(--text3)", fontSize: 12,
                textAlign: "center", padding: "20px 0"
              }}>
                Parameters compute after simulation
              </p>
            )}


          </Panel>
        </>
      )
      }
    </div >
  )
}
