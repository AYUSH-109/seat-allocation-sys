"""Launcher script — ensures CWD and sys.path are correct regardless of
where the command is invoked from."""

import os, sys

# Make sure Python can find sibling modules (config, utils, …)
_HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(_HERE)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from config import settings  # noqa: E402
import uvicorn               # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
