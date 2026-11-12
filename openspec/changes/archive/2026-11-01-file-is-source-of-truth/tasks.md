# Tasks

## Server

- [x] ETag (SHA-256 of the file) on GET and on a successful POST
- [x] POST checks If-Match; 409 with a reason when the file has changed
- [x] POST without If-Match only when no file exists
- [x] Keep the replaced file when a write changes the format version
- [x] Tests: stale write refused and file untouched; matching write accepted;
      ETag changes when the file is edited by hand; a format change keeps a copy

## Client

- [x] `loadFromEndpoint` returns the body and the ETag; `saveToFile` sends If-Match and keeps the new ETag
- [x] Startup order: HEAD, GET and adopt, then enable autosave
- [x] Saves are queued, so two in flight never refuse each other
- [x] A file this version cannot read is never autosaved over
- [x] On 409: autosave off, banner, "Reload from file" and "Download my copy"
- [x] Tests: two simulated tabs, the second is refused; startup never writes before the GET resolves

## Spec

- [x] Archive into `ticket-tracking` once implemented
