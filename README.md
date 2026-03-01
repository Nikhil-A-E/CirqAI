# CirqAI ⚡

AI-powered circuit design and SPICE simulation platform.
Describe any circuit in plain English (or Indian regional 
languages) and get a professional schematic + live 
simulation instantly.

## Features
- 🔌 AI schematic generation (Gemini)
- 📊 SPICE simulation (ngspice backend)
- 📉 Transient, AC/Bode, Parameter analysis
- 🌐 10 Indian regional languages
- 🎙 Voice input (Whisper)
- 📍 Interactive time-domain value lookup

## Tech Stack
- Frontend: React + Vite + Recharts
- Backend: FastAPI + Python
- AI: Google Gemini
- Simulation: ngspice + Whisper

## Local Setup

### Backend
cd CirqAi-backend
pip install -r requirements.txt
Create .env with: GEMINI_API_KEY=your_key
uvicorn main:app --reload

### Frontend  
cd CirqAi-frontend
npm install
Create .env.local with: VITE_API_URL=http://localhost:8000
npm run dev

## Built for AMD Slingshot 2026 — Theme 9
