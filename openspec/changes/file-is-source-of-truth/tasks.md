# Tasks

## Server

- [ ] ETag (SHA-256 of the file) on GET and on a successful POST
- [ ] POST checks If-Match; 409 with a reason when the file has changed
- [ ] POST without If-Match only when no file exists
- [ ] Tests: stale write refused and file untouched; matching write accepted;
      ETag changes when the file is edited by hand

## Client

- [ ] `loadFromEndpoint` returns the body and the ETag; `saveToFile` sends If-Match and keeps the new ETag
- [ ] Startup order: HEAD, GET and adopt, then enable autosave
- [ ] On 409: autosave off, banner, "Reload from file" (recorded) and "Download my copy"
- [ ] Tests: two simulated tabs, the second is refused; startup never writes before the GET resolves

## Spec

- [ ] Archive into `ticket-tracking` once implemented
