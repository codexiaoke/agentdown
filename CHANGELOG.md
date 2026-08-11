# Changelog

All notable changes to Agentdown are documented in this file.

## 0.1.0-rc.1 - 2026-08-11

Production Candidate release.

### Added

- Bounded Runtime resources, stream lifecycle cleanup, listener isolation and lightweight snapshots.
- Layered application, subtree and component configuration through `createAgentdown()` and `AgentdownProvider`.
- Structured Runtime and A2UI diagnostics for host telemetry systems.
- Real Google Chrome, Firefox and WebKit tests for Runtime streaming, HTML security and A2UI interactions.
- CI, package-consumer verification and OIDC-based npm release governance.

### Changed

- A2UI Basic Catalog now includes safe inline Markdown, keyboard Tabs, accessible Modal focus management,
  filterable ChoicePicker interactions and explicit pending action UI.
- Runtime HTML is always treated as untrusted and sanitized before entering `v-html`.
- A2UI transport delivery state remains separate from host-owned business execution state.

### Security

- DOMPurify is the default fail-closed sanitizer for untrusted HTML.
- Production dependency audit reports zero known vulnerabilities at release-candidate validation time.

The repository FastAPI service remains a test and example fixture; it is not part of the npm package's
production capability.
