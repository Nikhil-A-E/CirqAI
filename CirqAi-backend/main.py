from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from collections import defaultdict
import os
import time
import tempfile
import whisper as whisper_lib

load_dotenv()

from circuit_generator import generate_circuit
from schematic_renderer import render_schematic
from spice_simulator import run_spice, format_for_frontend

app = FastAPI(title="CircuitGPT API")

whisper_model = whisper_lib.load_model("base")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CircuitRequest(BaseModel):
    description: str
    language: str = "English"


@app.get("/health")
async def health():
    return {"status": "ok", "model": "gemini-flash (multi-model fallback)"}


# Simple in-memory rate limiter
_request_times = defaultdict(list)
RATE_LIMIT = 10        # max requests
RATE_WINDOW = 60       # per 60 seconds per IP


def check_rate_limit(client_ip: str):
    now = time.time()
    # Remove old entries outside the window
    _request_times[client_ip] = [
        t for t in _request_times[client_ip] if now - t < RATE_WINDOW
    ]
    if len(_request_times[client_ip]) >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Max {RATE_LIMIT} "
                   f"per {RATE_WINDOW} seconds."
        )
    _request_times[client_ip].append(now)


@app.post("/generate")
async def generate(req: CircuitRequest, request: Request):
    client_ip = request.client.host
    check_rate_limit(client_ip)

    try:
        result = generate_circuit(req.description, req.language)
        
        if "error" in result:
            raise HTTPException(
                status_code=400, detail=result["error"])
        
        circuit_data  = result.get("circuit", {})
        schematic_svg = result.get("schematic_svg", "")
        explanation   = result.get("explanation", "")
        spice_netlist = result.get("spice_netlist", "")
        
        # Add explanation and spice_netlist into circuit_data for frontend
        circuit_data["explanation"] = explanation
        circuit_data["spice_netlist"] = spice_netlist
        
        svg = render_schematic(circuit_data, schematic_svg)
        
        return {
            "circuit":      circuit_data,
            "schematic_svg": svg
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SimulateRequest(BaseModel):
    netlist: str
    circuit_name: str = "Circuit"


@app.post("/simulate")
async def simulate(req: SimulateRequest,
                   request: Request):
    """
    Run ngspice simulation on the provided netlist.
    Returns formatted waveform data for frontend charts.
    """
    client_ip = request.client.host
    check_rate_limit(client_ip)

    if not req.netlist or len(req.netlist) < 10:
        raise HTTPException(
            status_code=400,
            detail="Invalid netlist provided")

    try:
        # Run simulation
        raw_results = run_spice(
            req.netlist, req.circuit_name)

        if not raw_results.get("success"):
            raise HTTPException(
                status_code=422,
                detail=raw_results.get(
                    "error", "Simulation failed"))

        # Format for frontend charts
        formatted = format_for_frontend(raw_results)

        return {
            "success":    True,
            "results":    formatted,
            "raw":        raw_results
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=str(e))


@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...)
):
    tmp_path = None
    try:
        suffix = ".webm"
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix
        ) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        result = whisper_model.transcribe(tmp_path, fp16=False)
        return {
            "success": True,
            "text": result["text"].strip()
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"CircuitGPT backend running on http://localhost:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
