# CI configuration

- Set repository secret `SONAR_TOKEN` to a token authorized for the service projects.
- Set `SONAR_HOST_URL` to a full URL, such as `https://sonarcloud.io` for SonarQube Cloud or the HTTP(S) URL of your own server. Do not include quotes or whitespace.
- Both reusable workflows read `SONAR_HOST_URL` from Actions Variables first, then Secrets. An existing variable takes precedence over a secret with the same name.
- `validate_sonar_config.py` checks these settings before scanning without displaying credentials or making network requests. Sonar Quality Gate remains mandatory.
- Node workflows validate lockfiles with npm 10.9.4. Commit repaired lockfiles, then verify a clean `npm ci` before pushing.
- Each service's tests must use its own installed dependencies. Keep runtime tests for Checkin inside Checkin rather than importing it from Trekking tests.
- Trivy filesystem and image gates use version 0.76.1 and fail on HIGH or CRITICAL findings. Update vulnerable dependencies instead of suppressing findings.
- A scanner upload followed by `CE Task ... FAILED` is a Sonar background-processing error, not a Quality Gate rejection. On scanner failure, `report_sonar_task.py` reads the authenticated task error into the job log without printing the token.
- The GitHub default branch and Sonar main branch should agree. If a GitHub `main` analysis is treated as a short-lived branch targeting `master`, inspect the Sonar project's branch settings and background-task error before changing them.
- The root `.sonarcloud.properties` classifies source and test directories for the separate repository-wide Automatic Analysis project. Test code should be analyzed as tests rather than production code; service CI projects use their own source/test roots.

## Production images

- Node services install locked production dependencies in a separate stage. Runtime images start with `node src/index.js`; npm, npx, Corepack and Yarn are build tools and are not included in the runtime filesystem.
- The Agent uses Python 3.12 on Alpine 3.24. Tilemaker and osmium are compiled against the same Alpine ABI; GDAL CLIs come from the maintained Alpine packages. Build-time package managers and compilers stay outside the runtime.
- Image builds pull the current base image. The image vulnerability gate still scans both OS and application packages and blocks HIGH/CRITICAL findings, including vulnerabilities in base-image tooling.
- A successful filesystem scan does not imply that a built image is clean: base OS and globally installed tooling must also pass the image scan.
