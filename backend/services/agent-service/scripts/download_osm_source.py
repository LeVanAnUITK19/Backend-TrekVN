#!/usr/bin/env python3
"""Download a reusable regional OSM PBF with the publisher's MD5 checksum."""
from __future__ import annotations

import argparse
import hashlib
import re
import time
from pathlib import Path
from uuid import uuid4

import httpx


def download(url: str, output: Path) -> None:
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + f".{uuid4().hex}.part")
    try:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            response = client.get(url + ".md5")
            response.raise_for_status()
            parts = response.text.split()
            checksum = parts[0].lower() if parts else ""
            if not re.fullmatch(r"[a-f0-9]{32}", checksum):
                raise ValueError("Publisher returned an invalid MD5 checksum")
            if output.is_file():
                with output.open("rb") as file:
                    if hashlib.file_digest(file, "md5").hexdigest() == checksum:
                        print(f"Source already downloaded and checksum OK: {output}")
                        return
            digest, size, next_report = hashlib.md5(), 0, time.monotonic() + 20
            with client.stream("GET", url) as response:
                response.raise_for_status()
                with temporary.open("wb") as file:
                    for chunk in response.iter_bytes(1024 * 1024):
                        file.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
                        if time.monotonic() >= next_report:
                            print(f"Downloaded {size / 1024 / 1024:.1f} MiB", flush=True)
                            next_report = time.monotonic() + 20
            if size == 0 or digest.hexdigest() != checksum:
                raise ValueError("PBF checksum mismatch; source was not replaced. Retry the download.")
            temporary.replace(output)
            print(f"Source checksum OK: {output} ({size} bytes)")
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://download.geofabrik.de/asia/vietnam-latest.osm.pbf")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    download(args.url, args.output)
