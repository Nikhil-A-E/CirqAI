# CircuitGPT Frontend

## Local Run
1. `npm install`
2. `npm run dev`
3. App runs at http://localhost:5173

## Deploy to Netlify
1. Push this folder to a public GitHub repo
2. Go to netlify.com → Add New Site → Import from GitHub
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variable: `VITE_API_URL` = your Render backend URL
6. Deploy → your site is live!
