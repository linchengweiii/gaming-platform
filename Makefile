.PHONY: setup typecheck test build run funnel funnel-stop sim stress clean

TSC := $(shell if [ -x ~/.bun/install/cache/typescript@5.2.2/bin/tsc ]; then echo ~/.bun/install/cache/typescript@5.2.2/bin/tsc; else echo npx tsc; fi)
ESBUILD := $(shell if [ -x ~/.bun/install/cache/@esbuild/darwin-arm64@0.20.2/bin/esbuild ]; then echo ~/.bun/install/cache/@esbuild/darwin-arm64@0.20.2/bin/esbuild; else echo npx esbuild; fi)
TAILSCALE := $(shell if command -v tailscale >/dev/null 2>&1; then command -v tailscale; elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then echo /Applications/Tailscale.app/Contents/MacOS/Tailscale; else echo tailscale; fi)

setup:
	@mkdir -p apps/web/public/dist
	@echo "Setup complete."

typecheck:
	$(TSC) --noEmit

test:
	bun test

build:
	$(ESBUILD) apps/web/src/app.ts --bundle --format=esm --target=es2022 --outfile=apps/web/public/dist/app.js

sim:
	bun run packages/games/catan/src/cli-sim.ts

stress:
	bun run scripts/stress-20k.ts

run: build
	bun run apps/server/src/index.ts

funnel: build
	@echo "Enabling Tailscale Funnel -> http://localhost:3000 ..."
	$(TAILSCALE) funnel --bg 3000
	@$(TAILSCALE) funnel status
	bun run apps/server/src/index.ts

funnel-stop:
	$(TAILSCALE) funnel --https=443 off

clean:
	rm -rf apps/web/public/dist dist build coverage
