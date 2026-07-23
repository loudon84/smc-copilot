from __future__ import annotations

"""Linux systemd user service stub (deferred)."""

import argparse


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hermes Runtime systemd user service (stub)")
    parser.add_argument("action", choices=["install", "uninstall", "status"])
    args = parser.parse_args(argv)
    print(f"systemd_user_service stub: action={args.action} (not implemented in this release)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
