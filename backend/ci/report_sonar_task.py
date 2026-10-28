"""Read the scanner's background-task error without exposing authentication data."""

import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    report = Path(".scannerwork/report-task.txt")
    if not report.is_file():
        print("No Sonar background-task report: scanner failed before task submission.")
        return

    properties = dict(
        line.split("=", 1) for line in report.read_text(encoding="utf-8").splitlines()
        if "=" in line
    )
    task_id = properties.get("ceTaskId", "")
    host = os.environ.get("SONAR_HOST_URL", "").rstrip("/")
    token = os.environ.get("SONAR_TOKEN", "")
    parsed = urlsplit(host)
    if (
        not re.fullmatch(r"[A-Za-z0-9_-]+", task_id)
        or parsed.scheme not in {"https", "http"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not token
    ):
        print("Cannot retrieve Sonar task: missing or invalid scanner configuration.")
        return

    # Build the URL from the configured server, not a URL in the report file.
    request = Request(
        host + "/api/ce/task?" + urlencode({"id": task_id}),
        headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
    )
    try:
        with build_opener(NoRedirects()).open(request, timeout=20) as response:
            task = json.load(response).get("task", {})
    except HTTPError as exc:
        print(f"Sonar task diagnostics unavailable: HTTP {exc.code}.")
        return
    except (URLError, TimeoutError, ValueError):
        print("Sonar task diagnostics unavailable: network or response error.")
        return

    print("Sonar background-task status:", task.get("status", "unknown"))
    if task.get("errorMessage"):
        # JSON escaping keeps remote text on one log line; never print the token.
        message = str(task["errorMessage"]).replace(token, "[redacted]")[:4000]
        print("Sonar background-task error:", json.dumps(message, ensure_ascii=True))
    print("If the error requires project settings, inspect Administration > Background Tasks.")


if __name__ == "__main__":
    main()
