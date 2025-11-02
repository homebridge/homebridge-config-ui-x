# SSL uploads, validation, and self-signed generation

This PR adds a complete HTTPS management experience to Settings → Security → HTTPS:

- Upload PEM key + certificate with server-side validation
- Upload PKCS#12 (.pfx/.p12) with optional passphrase and validation
- Validate the currently configured HTTPS mode from the UI (“Validate SSL”)
- Generate a self-signed certificate from the UI with hostnames/SANs
  - Generate Self‑Signed & Use as Key + Cert (writes files, selects key/cert mode)
  - Generate & Enable Self‑Signed Mode (enables runtime self-signed mode)

See the updated mockup: `screenshots/ssl-upload-mock.svg`.

## Target branch

Per repo guidelines, this PR targets the current beta branch: `beta-5.8.1`.

## Backend (NestJS)

New/updated endpoints under Server module:

- POST `/server/ssl/keycert` — multipart upload for `key.pem` + `cert.pem`
  - Validates key↔cert pair via Node.js X509/tls before persisting
  - Saves to `{storagePath}/ssl-certs/ui-ssl.key` and `ui-ssl.crt`
  - Updates `config.json` → `ui.ssl` to key/cert mode; clears pfx/selfSigned
- POST `/server/ssl/pfx` — multipart upload for `ui-ssl.pfx` with optional `passphrase`
  - Validates by creating a SecureContext
  - Saves to `{storagePath}/ssl-certs/ui-ssl.pfx`
  - Updates `config.json` → `ui.ssl` to pfx mode; clears key/cert/selfSigned
- POST `/server/ssl/validate` — validates the current HTTPS configuration
  - Handles `off`, `selfsigned`, `keycert`, and `pfx` modes; returns status/details
- POST `/server/ssl/selfsigned/generate` — generates a self-signed cert
  - Body: `{ hostnames?: string[], mode?: 'keycert'|'selfsigned' }`
  - Uses existing SSL generator service
  - If `mode='keycert'`: writes `private-key.pem`/`certificate.pem`, sets key/cert mode
  - If `mode='selfsigned'`: enables runtime self-signed mode and records hostnames

Security: endpoints are admin-only and write under `{storagePath}/ssl-certs`.

## Frontend (Angular)

Settings → Security → HTTPS additions:

- HTTPS mode selector: Off, Self-Signed, Key+Cert, PFX
- “Validate SSL” button next to the selector
- Self-signed section:
  - Hostnames/SANs input (e.g. `localhost, 127.0.0.1, homebridge.local`)
  - Two actions:
    - “Generate Self‑Signed & Use as Key + Cert”
    - “Generate & Enable Self‑Signed Mode”
- Key/Cert upload (with unified “Upload” button) and PFX upload with passphrase field
- Toastr notifications and restart prompt after changes
- i18n keys added in `ui/src/i18n/en.json` for new labels and toasts

## Storage layout

All artifacts are saved under `{storagePath}/ssl-certs`:

- `ui-ssl.key` / `ui-ssl.crt` (file-based key/cert mode)
- `ui-ssl.pfx` (pfx mode)
- `private-key.pem` / `certificate.pem` (generated self-signed files)

## Manual validation

Follow the project’s validation steps:

1. Build and test:
   - `npm run build`
   - `npm run lint`
   - `npm run test`
2. Start the app (`npm run watch` for UI + backend) and open Settings → Security → HTTPS
3. Try each flow:
   - Upload Key+Cert and validate
   - Upload PFX (with/without passphrase) and validate
   - Generate self-signed with custom hostnames and select one of the two buttons
   - Use “Validate SSL” to verify the mode

Backend-only check (optional):

- POST `/server/ssl/validate` should return OK plus details of the active mode

## Notes

- Raspbian image: the self-signed UI option is hidden/disabled since nginx terminates TLS
- Admin-only scope maintained for all write endpoints

## Quality gates

- Build: PASS
- Lint: PASS
- Tests: PASS (310 e2e tests)

---

Compare URL (after pushing this branch):

https://github.com/homebridge/homebridge-config-ui-x/compare/beta-5.8.1...ssl-upload

Suggested PR title:

feat(settings/https): upload + validate SSL (PEM/PFX) and generate self-signed from UI

Suggested labels: `feature`, `settings`, `security`, `beta`
