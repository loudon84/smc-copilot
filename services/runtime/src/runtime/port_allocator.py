from __future__ import annotations

import socket

from core.config import Settings


def is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((host, port)) != 0


# @lat: [[gateway-supervisor#端口分配]]
def allocate_port(
    settings: Settings,
    requested: int | None,
    used_ports: set[int],
    *,
    max_scan: int = 100,
) -> int:
    if requested is not None:
        if requested in used_ports:
            raise ValueError(f"Gateway port already used by another profile: {requested}")
        if not is_port_available("127.0.0.1", requested):
            raise ValueError(f"Gateway port already occupied by OS process: {requested}")
        return requested

    base = settings.default_gateway_port
    for port in range(base, base + max_scan):
        if port in used_ports:
            continue
        if is_port_available("127.0.0.1", port):
            return port

    raise ValueError(f"No available gateway port in range {base}-{base + max_scan - 1}")
