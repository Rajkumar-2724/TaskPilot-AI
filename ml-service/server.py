from fastapi import FastAPI
import uvicorn

app = FastAPI()

# This is a minimal wrapper that trains models on startup
# Import the main app
import sys
sys.path.insert(0, '.')
from main import app as main_app

if __name__ == "__main__":
    uvicorn.run(main_app, host="0.0.0.0", port=8000)
