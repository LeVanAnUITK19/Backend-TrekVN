"""Check scanner configuration without displaying credentials or making requests."""

import os
import sys
from urllib.parse import urlsplit


def main():
    if not os.environ.get("SONAR_TOKEN", "").strip():
        print("::error::Configure repository secret SONAR_TOKEN.")
        return 1

    host = os.environ.get("SONAR_HOST_URL", "")
    try:
        url = urlsplit(host)
        valid = (
            url.scheme in {"https", "http"}
            and bool(url.hostname)
            and not any(char.isspace() for char in host)
            and url.username is None
            and url.password is None
            and not url.query
            and not url.fragment
        )
        # Accessing port also checks its format and range.
        _ = url.port
    except ValueError:
        valid = False

    if not valid:
        print(
            "::error::Set SONAR_HOST_URL in Actions Variables or Secrets to a "
            "full URL, for example https://sonarcloud.io. "
            "Do not include quotes or whitespace."
        )
        return 1

    print("Sonar token and server URL are configured.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
