# Security and privacy

Analysis, assertion, demo and report generation are offline. No telemetry, credentials, uploads, external assets, scenario expressions or arbitrary command execution exist. Dependency setup is separate. Runtime tests disable fetch, WebSocket, HTTP(S), socket, TLS, datagram and DNS entry points, verify that the tripwire detects attempted access without opening sockets, and exercise every CLI workflow. This is a JavaScript runtime check, not a complete OS isolation audit or security certification.

Strict schemas reject undeclared fields. Capture import whitelists observation fields and omits unknown values, including names, addresses, tokens and notes. Excluded fields remain visible as ordinal loss markers in observations.unmappedFields. Unknown envelope/coverage/mapping properties fail validation; no scope or semantic drift is silently repaired. Free text and caller-chosen identifiers can still contain sensitive data. Pseudonymization reduces risk but is not anonymity.

Local file reads reject traversal, URLs, NUL, non-regular files and symlink path components, and enforce 32 MiB per file. JSON rejects excessive nesting (32 levels), prototype keys and unsafe integers. CSV has 128-column and 32 MiB limits, strict quoting and exact integer parsing; formulas are never evaluated and CSV is not exported. Missing numeric cells remain missing. Programmatic callers must bound in-memory data; the API does not impose a process memory limit.

HTML/XML escape untrusted content, substitute disallowed XML controls and use a restrictive HTML CSP. Reports include accepted source evidence and share its confidentiality. Renderer callers must supply valid reports. Output creation is exclusive and refuses symlink parents; it is non-destructive, but not a transaction across three files. Trusted local directories are required: concurrent filesystem replacement is outside the model. Archives, executable importers and plugins are not supported.

## Private reporting and supported scope

The current unreleased v0.1 CLI/library and static demo on the default branch are maintained on a best-effort basis. There is no supported historical release series or response-time SLA.

Use [GitHub private vulnerability reporting](https://github.com/SafetyMP/commerce-reliability-kit/security/advisories/new), enabled for this repository. GitHub account [SafetyMP](https://github.com/SafetyMP) is the steward. Report a minimal synthetic reproduction, affected revision/version, impact, and environment. Do not post exploit details, credentials, or customer records in public issues.

The steward will assess reports and coordinate fixes and disclosure through private advisories. If that route becomes unavailable, do not publish sensitive details: a maintainer must restore private reporting or establish a real private contact. No alternate email or guaranteed response time is offered.
