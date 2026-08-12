from __future__ import annotations

import uvicorn

from app import create_app

app = create_app()


def main() -> None:
    uvicorn.run("main:app", host="127.0.0.1", port=8770, reload=False)


if __name__ == "__main__":
    main()
