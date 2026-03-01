FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies: ngspice and ffmpeg
RUN apt-get update && apt-get install -y \
    ngspice \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to leverage Docker cache
COPY CirqAi-backend/requirements.txt .

# Install Python dependencies using python -m pip as requested
RUN python -m pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code
COPY CirqAi-backend/ .

# Expose the port (Render sets the PORT environment variable)
EXPOSE 8000

# Command to run the application, using Render's PORT environment variable or defaulting to 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
