import { useState, useRef, useEffect } from "react"
import SimulationPanel from "./components/SimulationPanel"

const API_URL = import.meta.env.VITE_API_URL
  || "http://localhost:8000"

const LANGUAGES = [
  "English",
  "Hindi",
  "Kannada",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi"
]

export default function App() {
  const [prompt, setPrompt] = useState("")
  const [language, setLanguage] = useState("English")
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cacheRef = useRef({})
  const schematicRef = useRef(null)

  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    if (!schematicRef.current) return
    const svg = schematicRef.current.querySelector('svg')
    if (!svg) return
    // Remove fixed width/height, let CSS control it
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.style.width = '100%'
    svg.style.height = 'auto'
    svg.style.display = 'block'
    // Ensure viewBox exists so it scales properly
    if (!svg.getAttribute('viewBox')) {
      const w = svg.getAttribute('width') || '800'
      const h = svg.getAttribute('height') || '600'
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }
  }, [result])

  async function generate() {
    const q = prompt.trim()
    if (!q || loading) return
    if (cacheRef.current[q]) {
      setResult(cacheRef.current[q])
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: q,
          language: language
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(
        data.detail || "Generation failed")
      cacheRef.current[q] = data
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      generate()
    }
  }

  function toggleVoice() {
    if (processing) return

    if (listening) {
      mediaRecorderRef.current?.stop()
      setListening(false)
      return
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(stream => {
        const mimeType =
          MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/ogg")
              ? "audio/ogg"
              : "audio/mp4"

        const recorder = new MediaRecorder(
          stream, { mimeType }
        )
        mediaRecorderRef.current = recorder
        chunksRef.current = []

        recorder.ondataavailable = e => {
          if (e.data.size > 0)
            chunksRef.current.push(e.data)
        }

        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          if (!chunksRef.current.length) return
          setProcessing(true)
          try {
            const blob = new Blob(
              chunksRef.current, { type: mimeType }
            )
            const formData = new FormData()
            formData.append(
              "audio", blob,
              `rec.${mimeType.split("/")[1]}`
            )
            const res = await fetch(
              `${API_URL}/transcribe`,
              { method: "POST", body: formData }
            )
            const data = await res.json()
            if (data.success && data.text)
              setPrompt(data.text)
          } catch (e) {
            console.warn("Transcription error:", e)
          } finally {
            setProcessing(false)
          }
        }

        recorder.start()
        setListening(true)
      })
      .catch(e => {
        if (e.name === "NotAllowedError")
          alert("Microphone permission denied.")
        else
          alert("Mic unavailable: " + e.message)
      })
  }

  return (
    <div style={{
      position: "relative",
      zIndex: 1,
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden"
    }}>

      {/* ── TOP NAVBAR ── */}
      <nav style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: 52,
        borderBottom: "1px solid var(--border)",
        background: "rgba(8,12,14,0.95)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
        position: "relative",
        zIndex: 10
      }}>
        {/* Logo */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          {/* Icon */}
          <div style={{
            width: 28, height: 28,
            background: "var(--green)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 12px var(--green-glow)"
          }}>
            <svg width="16" height="16"
              viewBox="0 0 16 16" fill="none">
              <path d="M2 8h3l2-5 2 10 2-5h3"
                stroke="#080c0e" strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{
            fontFamily: "var(--font-head)",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "0.01em",
            color: "var(--text)",
            lineHeight: 1
          }}>
            Cirq<span style={{
              color: "var(--green)",
              fontWeight: 800
            }}>AI</span>
          </span>
        </div>

        {/* Status indicator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "var(--text3)",
          fontFamily: "var(--font-mono)"
        }}>
          <div style={{
            width: 6, height: 6,
            borderRadius: "50%",
            background: loading
              ? "#f59e0b"
              : result
                ? "var(--green)"
                : "var(--text3)",
            boxShadow: loading
              ? "0 0 8px #f59e0b"
              : result
                ? "0 0 8px var(--green)"
                : "none",
            animation: loading
              ? "pulse 1s infinite" : "none"
          }} />
          <span>
            {loading ? "GENERATING"
              : result ? "READY"
                : "STANDBY"}
          </span>
        </div>

        <style>{`
          @keyframes pulse {
            0%,100% { opacity:1; }
            50%      { opacity:0.3; }
          }
          @keyframes fadeIn {
            from { opacity:0; transform:translateY(8px); }
            to   { opacity:1; transform:translateY(0); }
          }
          @keyframes shimmer {
            0%   { background-position: -200% center; }
            100% { background-position:  200% center; }
          }
        `}</style>
      </nav>

      {/* ── MAIN BODY ── */}
      <div style={{
        display: "flex",
        flex: 1,
        overflow: "hidden"
      }}>

        {/* ── LEFT PANEL ── */}
        <div style={{
          width: "38%",
          minWidth: 340,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>

          {/* Input section — fixed at top */}
          <div style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0
          }}>
            {/* Label */}
            <div style={{
              fontSize: 10,
              color: "var(--text3)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              <span style={{
                display: "inline-block",
                width: 14,
                height: 1,
                background: "var(--green)"
              }} />
              Circuit Description
            </div>

            {/* Textarea */}
            <div style={{ position: "relative" }}>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  "Describe any circuit...\n" +
                  "e.g. RC low pass filter with 1kHz cutoff"
                }
                rows={4}
                style={{
                  width: "100%",
                  background: "var(--bg2)",
                  border: listening
                    ? "1px solid #00FFF2"
                    : "1px solid var(--border2)",
                  borderRadius: 8,
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: "12px 14px 38px 14px",
                  resize: "none",
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxShadow: listening
                    ? "0 0 0 3px rgba(0,255,242,0.3)"
                    : "none"
                }}
                onFocus={e => {
                  if (!listening) {
                    e.target.style.borderColor = "var(--green-dim)"
                    e.target.style.boxShadow =
                      "0 0 0 3px var(--green-glow)"
                  }
                }}
                onBlur={e => {
                  if (!listening) {
                    e.target.style.borderColor = "var(--border2)"
                    e.target.style.boxShadow = "none"
                  }
                }}
              />

              {/* REC indicator */}
              {(listening || processing) && (
                <div style={{
                  position: "absolute",
                  bottom: 11,
                  right: 46,
                  fontSize: 10,
                  color: processing
                    ? "var(--text3)" : "#00FFF2",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  pointerEvents: "none",
                  animation: listening
                    ? "pulse 1s infinite" : "none"
                }}>
                  {processing ? "PROCESSING..." : "● REC"}
                </div>
              )}

              {/* Mic button inside textarea */}
              <button
                onClick={toggleVoice}
                disabled={processing}
                title={
                  processing ? "Transcribing..."
                    : listening ? "Stop"
                      : "Voice input"
                }
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  width: 28,
                  height: 28,
                  background: listening
                    ? "#00FFF2"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${listening
                    ? "#00FFF2" : "var(--border2)"}`,
                  borderRadius: 6,
                  color: listening
                    ? "#080c0e" : "var(--text3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: processing ? "wait" : "pointer",
                  fontSize: 15,
                  transition: "all 0.2s",
                  boxShadow: listening
                    ? "0 0 12px rgba(0,255,242,0.6)" : "none",
                  animation: listening
                    ? "pulse 1s infinite" : "none",
                  zIndex: 2
                }}>
                {processing ? "⏳" : listening ? "⏹" : "🎙"}
              </button>
            </div>

            <div style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 10
            }}>
              <div style={{
                fontSize: 10,
                color: "var(--text3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
                flexShrink: 0
              }}>
                🌐 Language
              </div>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                style={{
                  flex: 1,
                  background: "var(--bg2)",
                  border: "1px solid var(--border2)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  padding: "6px 10px",
                  outline: "none",
                  cursor: "pointer",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23445566'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  paddingRight: 28
                }}>
                {LANGUAGES.map(lang => (
                  <option key={lang} value={lang}
                    style={{
                      background: "var(--bg2)",
                      color: "var(--text)"
                    }}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            {/* Generate button */}
            <button
              onClick={generate}
              disabled={loading || !prompt.trim()}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "11px",
                background: loading
                  ? "var(--bg3)"
                  : prompt.trim()
                    ? "var(--green)"
                    : "var(--bg3)",
                border: "1px solid",
                borderColor: loading
                  ? "var(--border2)"
                  : prompt.trim()
                    ? "var(--green)"
                    : "var(--border2)",
                borderRadius: 8,
                color: loading || !prompt.trim()
                  ? "var(--text3)"
                  : "#080c0e",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.05em",
                cursor: loading || !prompt.trim()
                  ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                boxShadow: !loading && prompt.trim()
                  ? "0 0 20px var(--green-glow)"
                  : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}
              onMouseEnter={e => {
                if (!loading && prompt.trim()) {
                  e.target.style.background = "#00ffb3"
                  e.target.style.boxShadow =
                    "0 0 30px rgba(0,255,157,0.4)"
                }
              }}
              onMouseLeave={e => {
                if (!loading && prompt.trim()) {
                  e.target.style.background = "var(--green)"
                  e.target.style.boxShadow =
                    "0 0 20px var(--green-glow)"
                }
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    display: "inline-block",
                    width: 12, height: 12,
                    border: "2px solid var(--text3)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite"
                  }} />
                  <style>{`
                    @keyframes spin {
                      to { transform:rotate(360deg); }
                    }
                  `}</style>
                  Generating Circuit...
                </>
              ) : (
                <>⚡ Generate Circuit</>
              )}
            </button>

            {/* Hint */}
            <div style={{
              marginTop: 8,
              fontSize: 10,
              color: "var(--text3)",
              textAlign: "right"
            }}>
              Ctrl+Enter to generate
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              margin: "12px 20px 0",
              padding: "10px 14px",
              background: "rgba(255,68,102,0.08)",
              border: "1px solid rgba(255,68,102,0.3)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--danger)",
              flexShrink: 0
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Scrollable results area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: result ? "16px 20px 24px" : 0
          }}>

            {/* Empty state */}
            {!result && !loading && !error && (
              <div style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "var(--text3)",
                padding: 40
              }}>
                <svg width="48" height="48"
                  viewBox="0 0 48 48"
                  fill="none" opacity="0.4">
                  <rect x="4" y="4" width="40" height="40"
                    rx="4" stroke="currentColor"
                    strokeWidth="1.5" />
                  <path d="M12 24h6l4-8 4 16 4-8h6"
                    stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round" />
                </svg>
                <p style={{
                  fontSize: 12,
                  textAlign: "center",
                  lineHeight: 1.6
                }}>
                  Describe a circuit above<br />
                  to generate schematic + simulation
                </p>
              </div>
            )}

            {result && (
              <div style={{
                animation: "fadeIn 0.4s ease"
              }}>
                {/* Circuit name */}
                <div style={{
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 3,
                      height: 20,
                      background: "var(--green)",
                      borderRadius: 2,
                      boxShadow: "0 0 8px var(--green)"
                    }} />
                    <span style={{
                      fontFamily: "var(--font-head)",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text)"
                    }}>
                      {result.circuit?.circuit_name ||
                        "Generated Circuit"}
                    </span>
                  </div>

                  {result.schematic_svg && (
                    <button
                      onClick={() => {
                        const blob = new Blob([result.schematic_svg], { type: "image/svg+xml" })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = `${(result.circuit?.circuit_name || "circuit").replace(/\s+/g, '_')}_schematic.svg`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(url)
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--text3)",
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
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
                      ⬇ Download SVG
                    </button>
                  )}
                </div>

                {/* SVG Schematic */}
                {result.schematic_svg && (
                  <div style={{
                    background: "white",
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--border2)",
                    marginBottom: 16,
                    boxShadow: "0 0 30px rgba(0,0,0,0.4)"
                  }}>
                    <style>{`
                      .schematic-wrapper svg {
                        width: 100% !important;
                        height: auto !important;
                        max-width: 100% !important;
                        display: block !important;
                      }
                    `}</style>
                    <div
                      ref={schematicRef}
                      className="schematic-wrapper"
                      dangerouslySetInnerHTML={{
                        __html: result.schematic_svg
                      }}
                      style={{
                        width: "100%",
                        display: "block",
                        lineHeight: 0,
                        overflow: "hidden"
                      }}
                    />
                  </div>
                )}

                {/* Component list */}
                {result.circuit?.components?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 10,
                      color: "var(--text3)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}>
                      <span style={{
                        display: "inline-block",
                        width: 14, height: 1,
                        background: "var(--blue)"
                      }} />
                      Components
                    </div>
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6
                    }}>
                      {result.circuit.components.map((c, i) => (
                        <div key={i} style={{
                          background: "var(--bg2)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: "4px 12px",
                          alignItems: "start"
                        }}>
                          {/* Left: ID badge */}
                          <div style={{
                            background: "rgba(0,180,255,0.1)",
                            border: "1px solid rgba(0,180,255,0.25)",
                            borderRadius: 5,
                            padding: "3px 8px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--blue)",
                            letterSpacing: "0.05em",
                            gridRow: "1 / 3",
                            alignSelf: "center",
                            whiteSpace: "nowrap"
                          }}>
                            {c.id}
                          </div>
                          {/* Top right: value */}
                          <div style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text)",
                            lineHeight: 1.3
                          }}>
                            {c.value || c.type || ""}
                          </div>
                          {/* Bottom right: function/description */}
                          <div style={{
                            fontSize: 11,
                            color: "var(--text3)",
                            lineHeight: 1.4
                          }}>
                            {c.function || c.description || c.purpose ||
                              (() => {
                                const id = (c.id || "").toUpperCase()
                                const val = (c.value || "").toLowerCase()
                                if (id.startsWith("R"))
                                  return "Current limiting / biasing resistor"
                                if (id.startsWith("C"))
                                  return val.includes("n") || val.includes("u")
                                    ? "Coupling / bypass capacitor"
                                    : "Filter capacitor"
                                if (id.startsWith("L"))
                                  return "Inductor / RF choke"
                                if (id.startsWith("Q"))
                                  return "Transistor — amplification / switching"
                                if (id.startsWith("D"))
                                  return "Diode — rectification / protection"
                                if (id.startsWith("U") || id.startsWith("IC"))
                                  return "Integrated circuit"
                                if (id.startsWith("V"))
                                  return "Voltage source"
                                if (id.startsWith("X"))
                                  return "Subcircuit / module"
                                return "Circuit component"
                              })()
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Explanation */}
                {result.circuit?.explanation && (
                  <div style={{
                    background: "var(--bg2)",
                    border: "1px solid var(--border)",
                    borderLeft: "3px solid var(--green)",
                    borderRadius: "0 8px 8px 0",
                    padding: "14px 16px"
                  }}>
                    <div style={{
                      fontSize: 10,
                      color: "var(--green-dim)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                      fontWeight: 600
                    }}>
                      How it works
                    </div>
                    <p style={{
                      fontSize: 12,
                      color: "var(--text2)",
                      lineHeight: 1.7,
                      fontFamily: "var(--font-mono)"
                    }}>
                      {result.circuit.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: SIMULATION ── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg)"
        }}>
          {result ? (
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 24px"
            }}>
              <SimulationPanel
                circuit={result.circuit} />
            </div>
          ) : (
            /* Right panel empty state */
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              padding: 40,
              color: "var(--text3)"
            }}>
              {/* Animated oscilloscope preview */}
              <div style={{
                width: 280,
                height: 140,
                border: "1px solid var(--border2)",
                borderRadius: 12,
                background: "var(--bg2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden"
              }}>
                <svg width="260" height="120"
                  viewBox="0 0 260 120">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4, 5, 6].map(i => (
                    <line key={i}
                      x1={i * 40 + 20} y1="10"
                      x2={i * 40 + 20} y2="110"
                      stroke="var(--border)"
                      strokeWidth="1" />
                  ))}
                  {[0, 1, 2, 3].map(i => (
                    <line key={i}
                      x1="20" y1={i * 30 + 10}
                      x2="240" y2={i * 30 + 10}
                      stroke="var(--border)"
                      strokeWidth="1" />
                  ))}
                  {/* Sine wave */}
                  <path
                    d={`M 20,60 
                      C 40,10 60,10 80,60 
                      C 100,110 120,110 140,60 
                      C 160,10 180,10 200,60 
                      C 220,110 240,110 260,60`}
                    stroke="var(--green)"
                    strokeWidth="2"
                    fill="none"
                    opacity="0.8"
                    style={{
                      filter: "drop-shadow(0 0 4px var(--green))"
                    }}
                  />
                  {/* Second wave */}
                  <path
                    d={`M 20,60 
                      C 40,25 60,25 80,60 
                      C 100,95 120,95 140,60
                      C 160,25 180,25 200,60
                      C 220,95 240,95 260,60`}
                    stroke="var(--blue)"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.5"
                    style={{
                      filter: "drop-shadow(0 0 3px var(--blue))"
                    }}
                  />
                </svg>
              </div>

              <div style={{ textAlign: "center" }}>
                <p style={{
                  fontFamily: "var(--font-head)",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--text2)",
                  marginBottom: 8
                }}>
                  Simulation Ready
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.6 }}>
                  Generate a circuit to run<br />
                  SPICE transient, AC, and parameter analysis
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
