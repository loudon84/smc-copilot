from __future__ import annotations

"""macOS LaunchAgent stub (deferred — runtime logic is cross-platform; daemon packaging later)."""

import argparse


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hermes Runtime LaunchAgent (stub)")
    parser.add_argument("action", choices=["install", "uninstall", "status"])
    args = parser.parse_args(argv)
    print(f"launch_agent stub: action={args.action} (not implemented in this release)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
