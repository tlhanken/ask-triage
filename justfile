# Shortcuts for running and checking the app. Optional: every recipe is a thin
# wrapper over an npm script, and npm keeps working on its own.
#
# Options go before the recipe, and map onto the ASK_TRIAGE_* settings
# documented in .env.example:
#
#     just port=8080 dev
#     just data=~/notes/register.json serve
#
# An option left out is not set at all, so .env.local still applies to it.

# Port to listen on. Default: 5173 for dev, 4173 for serve.
port := ""
# Address to listen on; 0.0.0.0 opens it to other machines. Default: localhost only.
host := ""
# Where the register is saved. Default: data/register.json
data := ""

# Only the options given become variables. Vite lets a real variable win over
# .env.local even when it is empty, so an empty one must not be set at all.
_port := if port != "" { "ASK_TRIAGE_PORT=" + quote(port) + " " } else { "" }
_host := if host != "" { "ASK_TRIAGE_HOST=" + quote(host) + " " } else { "" }
_data := if data != "" { "ASK_TRIAGE_DATA_FILE=" + quote(data) + " " } else { "" }
_env := _port + _host + _data

# List the recipes
default:
    @{{ just_executable() }} --list --unsorted

# Run the dev server, with live reload
dev: _deps
    {{ _env }}npm run dev

# Build, then serve the build: the one to leave running
serve: _deps
    npm run build
    {{ _env }}npm run preview

# Run dev or serve open to other machines, e.g. over Tailscale (just lan serve)
lan recipe="dev":
    @{{ just_executable() }} host=0.0.0.0 port={{ quote(port) }} data={{ quote(data) }} {{ recipe }}

# Show the settings the server would use, after .env.local and the options above
config: _deps
    @{{ _env }}node --input-type=module -e '\
      import { loadEnv } from "vite"; \
      const e = loadEnv("development", process.cwd(), "ASK_TRIAGE_"); \
      console.log("port  " + (e.ASK_TRIAGE_PORT || "5173 for dev, 4173 for serve")); \
      console.log("host  " + (e.ASK_TRIAGE_HOST || "localhost only")); \
      console.log("data  " + (e.ASK_TRIAGE_DATA_FILE || "data/register.json"));'

# Everything CI runs: typecheck, lint, test, build
check: _deps
    npm run typecheck
    npm run lint
    npm test
    npm run build

# Run the tests, or some of them (just test src/domain)
test *paths: _deps
    npm test -- {{ paths }}

# Install dependencies exactly as locked
install:
    npm ci

# Install dependencies on a fresh clone
[private]
_deps:
    @test -d node_modules || npm ci
