"""Scan files eligible for Git and committed history; never print secret values."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "google-api-key": re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    "github-token": re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})"),
    "groq-key": re.compile(r"gsk_[A-Za-z0-9]{40,}"),
    "openai-key": re.compile(r"sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}"),
    "aws-key": re.compile(r"(?:AKIA|ASIA)[A-Z0-9]{16}"),
    "credential-uri": re.compile(r"(?:mongodb(?:\+srv)?|amqps?)://[^\s/:]+:[^\s/@]+@"),
    "jwt-literal": re.compile(r"eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}"),
}

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def inspect(label, data):
    text = data.decode("utf-8", errors="replace")
    findings = []
    for number, line in enumerate(text.splitlines(), 1):
        for kind, regex in PATTERNS.items():
            for match in regex.finditer(line):
                value = match.group()
                # Documented example values and localhost test credentials.
                if any(word in value.lower() for word in ("example", "placeholder", "your-", "your_", "localhost", "127.0.0.1")):
                    continue
                if kind == "credential-uri" and re.search(r"://<[^>]+>:<[^>]+>@", value):
                    continue
                findings.append((label, number, kind))
    return findings

def main():
    findings = []
    files = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")
    for name in sorted(set(filter(None, files))):
        path = ROOT / name
        if path.is_file() and path.stat().st_size <= 5_000_000:
            findings.extend(inspect(name, path.read_bytes()))
    if "--history" in sys.argv:
        for row in git("rev-list", "--objects", "--all").decode().splitlines():
            parts = row.split(" ", 1)
            if len(parts) != 2:
                continue
            oid, name = parts
            if git("cat-file", "-t", oid).strip() != b"blob":
                continue
            if int(git("cat-file", "-s", oid)) <= 5_000_000:
                findings.extend(inspect("history:" + name, git("cat-file", "blob", oid)))
    for name, line, kind in sorted(set(findings)):
        print(f"{name}:{line}: possible {kind} (value redacted)")
    print(f"Scanned {len(set(filter(None, files)))} Git candidates; {len(set(findings))} findings.")
    return bool(findings)

if __name__ == "__main__":
    sys.exit(main())
