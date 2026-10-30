import os
import sys
import uvicorn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Landslide Risk Detection & Dynamic Routing Engine Server on port {port}...")
    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, reload_dirs=[backend_dir])

