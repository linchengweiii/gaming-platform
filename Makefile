.PHONY: setup typecheck test build run sim stress clean

TSC := $(shell if [ -x ~/.bun/install/cache/typescript@5.2.2/bin/tsc ]; then echo ~/.bun/install/cache/typescript@5.2.2/bin/tsc; else echo npx tsc; fi)
ESBUILD := $(shell if [ -x ~/.bun/install/cache/@esbuild/darwin-arm64@0.20.2/bin/esbuild ]; then echo ~/.bun/install/cache/@esbuild/darwin-arm64@0.20.2/bin/esbuild; else echo npx esbuild; fi)

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

clean:
	rm -rf apps/web/public/dist dist build coverage
