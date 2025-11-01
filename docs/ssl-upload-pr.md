# HTTPS by default: ports, redirect, SSL uploads, validation, and self-signed generation

This PR makes HTTPS the default, introduces clear port controls with redirect support, and adds a complete HTTPS management experience under Settings → Security → HTTPS.

Highlights:

- Default ports: HTTPS 8581, HTTP 8580
- HTTPS-first server startup with sane precedence: `httpsPort > port > httpPort`
- Optional HTTP → HTTPS redirect server when enabled (binds to HTTP port)
- UI: HTTPS Port field (when HTTPS is enabled) and Redirect toggle + HTTP Port
- UI: Network → “Homebridge UI Port” is hidden when HTTPS is enabled (shown only when HTTPS is Off)
- Upload PEM key + certificate with server-side validation
- Upload PKCS#12 (.pfx/.p12) with optional passphrase and validation
- Validate the currently configured HTTPS mode from the UI (“Validate SSL”)
- Generate a self-signed certificate from the UI with hostnames/SANs
  - Generate Self‑Signed & Use as Key + Cert (writes files, selects key/cert mode)
  - Generate & Enable Self‑Signed Mode (enables runtime self-signed mode)

See the updated mockup: `screenshots/ssl-upload-mock.svg`.

## Target branch

Per repo guidelines, this PR targets the current beta branch: `beta-5.8.1`.

## Defaults and ports

- HTTPS is preferred by default. New installs run on HTTPS 8581 with a self-signed certificate and expose HTTP 8580 for redirect if enabled.
- Startup precedence: the effective bind is determined by `httpsPort` (if HTTPS is configured) else `port` (legacy) else `httpPort`.
- Redirect: when “Redirect HTTP to HTTPS” is enabled and ports differ, the app binds to the HTTP port and issues 301 redirects to the HTTPS origin.

## Backend (NestJS)

Bootstrap and endpoints:

- HTTPS-first startup; falls back to HTTP if HTTPS cannot bind.
- Optional HTTP redirect server when redirect is enabled and HTTP/HTTPS ports differ.
- New/updated endpoints under Server module:
  - POST `/server/ssl/keycert` — multipart upload for `key.pem` + `cert.pem`
    - Validates key↔cert pair via Node.js X509/tls before persisting
    - Saves to `{storagePath}/ssl-certs/ui-ssl.key` and `ui-ssl.crt`
    - Updates `config.json` → `ui.ssl` to key/cert mode; clears pfx/selfSigned
  - POST `/server/ssl/pfx` — multipart upload for `ui-ssl.pfx` with optional `passphrase`
    - Validates by creating a SecureContext
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

Settings → Security → HTTPS additions and UX:

- HTTPS mode selector: Off, Self-Signed, Key+Cert, PFX
- “Validate SSL” button next to the selector
- Ports and redirect:
  - HTTPS Port field is shown whenever HTTPS is enabled (default 8581)
  - “Redirect HTTP to HTTPS” toggle
  - HTTP Port field appears when redirect is enabled (default 8580)
- UI cleanup: Network → “Homebridge UI Port” is hidden when HTTPS is enabled (to avoid duplication); it is only visible when HTTPS mode is Off
- Self-signed section:
  - Hostnames/SANs input (e.g. `localhost, 127.0.0.1, homebridge.local`)
  - Two actions:
    - “Generate Self‑Signed & Use as Key + Cert”
    - “Generate & Enable Self‑Signed Mode”
- Key/Cert upload (with unified “Upload” button) and PFX upload with passphrase field
- Toastr notifications and restart prompt after changes
- i18n keys added in `ui/src/i18n/en.json` for new labels and toasts

## Installer (hb-service)

- On install, if no SSL is configured, a self-signed certificate is generated and HTTPS is enabled by default.
- Default ports are set (HTTPS 8581, HTTP 8580 if needed), and post-install output prefers the HTTPS URL.
- Status checks and service messages adapt to HTTPS when active.

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
2. Start the app (`npm run watch` for UI + backend)
3. Verify ports and redirect:
   - Visit `https://localhost:8581` (accept self-signed) — app should load
   - Visit `http://localhost:8580` — should 301 redirect to the HTTPS origin when redirect is enabled
4. Settings → Security → HTTPS flows:
   - Upload Key+Cert and validate
   - Upload PFX (with/without passphrase) and validate
   - Generate self-signed with custom hostnames and select one of the two actions
   - Use “Validate SSL” to verify the active mode

Backend-only check (optional):

- POST `/server/ssl/validate` should return OK plus details of the active mode

## Notes

- Raspbian image: the self-signed UI option is hidden/disabled since nginx terminates TLS
- Admin-only scope maintained for all write endpoints

## Quality gates

- Build: PASS
- Lint: PASS
- Tests: PASS (195 e2e tests)

---

Compare URL (after pushing this branch):

https://github.com/homebridge/homebridge-config-ui-x/compare/beta-5.8.1...ssl

Suggested PR title:

feat(settings/https): HTTPS by default (ports + redirect), SSL upload/validate, and self-signed generation

Suggested labels: `feature`, `settings`, `security`, `beta`
