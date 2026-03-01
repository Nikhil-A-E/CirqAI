# 1. Choose the base environment
FROM python:3.10-slim

# 2. Set the working directory
WORKDIR /app

# 3. This replaces your old BUILD COMMAND for system packages
RUN apt-get update && apt-get install -y ngspice ffmpeg && rm -rf /var/lib/apt/lists/*

# 4. Copy your requirements file
COPY requirements.txt .

# 5. This replaces your old BUILD COMMAND for Python packages
# Using python -m pip to ensure it runs correctly on your setup
RUN python -m pip install --no-cache-dir -r requirements.txt

# 6. Copy the rest of your backend code
COPY . .

# 7. Expose the port Render uses
EXPOSE 10000

# 8. This replaces your old START COMMAND
# You will need to change "app.py" to whatever file actually starts your backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
