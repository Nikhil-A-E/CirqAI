# CirqAI ⚡

> AI-powered circuit design and SPICE simulation — 
> describe any circuit in plain English (or Indian 
> regional languages) and get a professional schematic 
> + live simulation instantly.

![CirqAI Demo](demo.png)

## What it does

CirqAI removes the barrier between circuit ideas and 
professional EDA tools. Instead of learning complex 
software like Cadence or LTSpice, you just describe 
what you want:

- **"RC low pass filter with 1kHz cutoff"**
- **"Colpitts oscillator at 10MHz using 2N2222"**  
- **"555 timer LED blinker at 2Hz"**

And instantly get:
- Professional schematic (SVG)
- SPICE transient simulation with live crosshair
- AC/Bode plot with automatic -3dB detection
- Circuit parameters (peak voltage, phase shift, cutoff)
- Full explanation in your language

## Features

| Feature | Details |
|---|---|
| 🔌 AI Schematic Generation | Google Gemini generates accurate schematics |
| 📊 SPICE Simulation | ngspice transient + AC analysis |
| 📉 Bode Plot | Auto-detects cutoff frequency |
| 🕐 Time Lookup | Enter any time value, get exact voltages |
| 🌐 10 Indian Languages | English, Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, Punjabi |
| 🎙 Voice Input | Speak your circuit description (Whisper) |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Recharts |
| Backend | FastAPI + Python |
| AI | Google Gemini 2.0 Flash |
| Simulation | ngspice (open source SPICE) |
| Voice | OpenAI Whisper (local, free) |

---

## Local Setup — Step by Step

### Prerequisites

Install these before starting:

| Tool | Download | Verify |
|---|---|---|
| Python 3.10+ | python.org | `python --version` |
| Node.js 18+ | nodejs.org | `node --version` |
| ngspice | ngspice.sourceforge.net | `ngspice --version` |
| ffmpeg | ffmpeg.org/download | `ffmpeg -version` |
| Git | git-scm.com | `git --version` |

**Windows ngspice install:**
1. Download from https://ngspice.sourceforge.net/download.html
2. Install to `C:\ngspice\`
3. Add `C:\ngspice\Spice64\bin` to Windows PATH

**Windows ffmpeg install:**
1. Download from https://www.gyan.dev/ffmpeg/builds/
   → ffmpeg-release-essentials.zip
2. Extract and rename folder to `ffmpeg`
3. Move to `C:\ffmpeg\`
4. Add `C:\ffmpeg\bin` to Windows PATH
5. Restart terminal

---

### Step 1 — Clone the repo
```bash
git clone https://github.com/Nikhil-A-E/CirqAI.git
cd CirqAI
```

### Step 2 — Get a Gemini API Key

1. Go to https://aistudio.google.com
2. Click "Get API Key" → Create API Key
3. Copy the key (starts with `AIza...`)

### Step 3 — Backend setup
```bash
cd CirqAi-backend

# Create virtual environment (recommended)
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
# Windows:
echo GEMINI_API_KEY=your_key_here > .env
# Mac/Linux:
echo "GEMINI_API_KEY=your_key_here" > .env

# Start backend
uvicorn main:app --reload
```

Backend runs at: http://localhost:8000

> ⚠️ First time you use voice input, Whisper 
> downloads ~140MB model. This is automatic and 
> cached after first use.

### Step 4 — Frontend setup

Open a NEW terminal window:
```bash
cd CirqAI/CirqAi-frontend

# Install dependencies
npm install

# Create environment file
# Windows:
echo VITE_API_URL=http://localhost:8000 > .env.local
# Mac/Linux:
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Start frontend
npm run dev
```

Frontend runs at: http://localhost:5173

### Step 5 — Open in browser

Go to **http://localhost:5173**

You should see the CirqAI interface. Type any circuit 
description and click Generate Circuit.

---

## Project Structure
CirqAI/
├── CirqAi-backend/
│   ├── main.py              # FastAPI app + endpoints
│   ├── circuit_generator.py # Gemini AI integration
│   ├── spice_simulator.py   # ngspice wrapper + parser
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # YOUR API KEY (not committed)
│
├── CirqAi-frontend/
│   ├── src/
│   │   ├── App.jsx          # Main layout + voice input
│   │   ├── SimulationPanel.jsx  # All 3 simulation panels
│   │   └── index.css        # CirqAI theme (dark, phosphor green)
│   ├── index.html
│   ├── package.json
│   └── .env.local           # API URL (not committed)
│
└── README.md

---

## Usage Examples

Try these prompts to see different circuit types:
RC low pass filter with 1kHz cutoff frequency
Inverting op-amp amplifier with gain of 10
555 timer astable multivibrator at 1kHz
Colpitts oscillator at 10MHz using 2N2222
Full wave bridge rectifier with 12V transformer
Common emitter BJT amplifier with 2N2222

**Voice input:** Click the 🎙 button and describe 
your circuit — works in any language.

**Language support:** Select from the dropdown 
before generating — explanation appears in 
your chosen language.

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/generate` | POST | Generate circuit from description |
| `/simulate` | POST | Run SPICE simulation on netlist |
| `/transcribe` | POST | Transcribe voice to text (Whisper) |
| `/health` | GET | Backend health check |

---

## Built for AMD Slingshot 2026

CirqAI democratizes circuit design for students 
across India — no expensive software, no language 
barrier, no prerequisite knowledge needed.

---

## Troubleshooting

**"ngspice not found"**
→ Add ngspice to PATH and restart terminal

**"No module named whisper"**  
→ Run: `pip install openai-whisper`

**"ffmpeg not found"**  
→ Install ffmpeg and add to PATH

**Simulation returns empty**  
→ Make sure ngspice is installed and in PATH
→ Check backend terminal for [SPICE] logs

**Frontend blank page after generate**
→ Open browser console (F12) and share error
