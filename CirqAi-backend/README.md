# CircuitGPT Backend

## Local Run
1. Add your Gemini API key to `.env` file
2. `pip install -r requirements.txt`
3. `uvicorn main:app --reload`
4. API runs at http://localhost:8000

## Deploy to Render
1. Push this folder to a public GitHub repo
2. Go to render.com → New Web Service → connect repo
3. Add environment variable: `GEMINI_API_KEY` = your API key
4. Deploy → copy the URL
