# CI configuration

- Set repository secret `SONAR_TOKEN` to a token authorized for the service projects.
- Set `SONAR_HOST_URL` to a full URL, such as `https://sonarcloud.io` for SonarQube Cloud or the HTTP(S) URL of your own server. Do not include quotes or whitespace.
- Both reusable workflows read `SONAR_HOST_URL` from Actions Variables first, then Secrets. An existing variable takes precedence over a secret with the same name.
- `validate_sonar_config.py` checks these settings before scanning without displaying credentials or making network requests. Sonar Quality Gate remains mandatory.
- Node workflows validate lockfiles with npm 10.9.4. Commit repaired lockfiles, then verify a clean `npm ci` before pushing.
- Each service's tests must use its own installed dependencies. Keep runtime tests for Checkin inside Checkin rather than importing it from Trekking tests.
- Trivy filesystem and image gates use version 0.76.1 and fail on HIGH or CRITICAL findings. Update vulnerable dependencies instead of suppressing findings.
