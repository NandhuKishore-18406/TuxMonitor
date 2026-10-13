def main() -> None:
    import uvicorn
    import sys
    import os
    # Ensure backend directory is in python path
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    uvicorn.run("main:app", host="0.0.0.0", port=15000, reload=False)

