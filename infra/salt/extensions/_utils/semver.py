"""Semver sort helper copied from Runtime install logic (no Runtime import)."""

from __future__ import annotations


def semver_key(version: str) -> tuple[int, int, int]:
    core = version.strip().lstrip("vV").split("+", 1)[0].split("-", 1)[0]
    parts = core.split(".")
    nums: list[int] = []
    for part in parts[:3]:
        digits = "".join(ch for ch in part if ch.isdigit())
        nums.append(int(digits) if digits else 0)
    while len(nums) < 3:
        nums.append(0)
    return nums[0], nums[1], nums[2]
