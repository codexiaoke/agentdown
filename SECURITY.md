# Security Policy

## Supported versions

Security fixes are provided for the latest npm release and the latest release candidate when one exists.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's private
[GitHub Security Advisory](https://github.com/codexiaoke/agentdown/security/advisories/new) form and include:

- affected version and import path;
- minimal reproduction or malicious payload;
- expected and observed impact;
- browser, Node.js and framework versions.

Please allow the maintainers time to reproduce and coordinate a fix before public disclosure.

## Security boundary

Agentdown is a frontend library. Applications remain responsible for authentication, authorization,
business validation, audit logging, action idempotency and persistent conversation storage on the backend.
The repository FastAPI service is not a production security boundary.
