# Development

Use Node **22.23.2**, npm **10**, TypeScript 5.9.3, React 19.2.0, and Vite 7.2.2. Keep root and demo lockfiles separate. Installation requires registry access or a populated npm cache; runtime evaluation needs no external services.

From the repository root:

```sh
npm ci --ignore-scripts
npm --prefix apps/demo ci --ignore-scripts
npm run check
npm test
npm run build
npm --prefix apps/demo test
npm --prefix apps/demo run build
node --experimental-strip-types --test --test-name-pattern="protected design gate" acceptance/contract.test.mjs
node --experimental-strip-types acceptance/frontend-gate.mjs
node --test scripts/publication-check.test.mjs
node --test scripts/publication-check.test.mjs
node scripts/publication-check.mjs --check
```

There is no lint command configured. `node acceptance/run-tests.mjs` combines product and portable contract checks. `node acceptance/frontend-check.mjs` combines demo gate, typecheck, tests, and build. Neither requires a host-specific launcher. Dependency installation is separate from tests.

For dependencies without executable shims, equivalent demo commands are:

```sh
node apps/demo/node_modules/typescript/bin/tsc -p apps/demo/tsconfig.json --noEmit
node --experimental-strip-types --test apps/demo/tests/*.test.ts
node apps/demo/node_modules/vite/bin/vite.js build apps/demo
```

Start development with `npm --prefix apps/demo run dev`. Build and check the repository subpath:

```sh
PAGES_BASE_PATH=/commerce-reliability-kit/ npm --prefix apps/demo run build
node scripts/publication-check.mjs --artifact apps/demo/dist --base /commerce-reliability-kit/
npm --prefix apps/demo run preview
```

Visit the preview server at `/commerce-reliability-kit/`, including `#library`, `#workbench`, `#report`, and `#compare`. Hash navigation survives refresh without server rewrites; report history does not. Follow the [demo guide](demo-guide.md) for journeys and [deployment](deployment.md) for browser acceptance. Static checks and Node rendering are not browser verification.

The repository inventory is deterministic: `node scripts/publication-check.mjs --list` emits paths, and `--json` emits paths with SHA-256 content hashes. Only that reviewed set is intended for publication. Add new public files to `scripts/publication-files.json` deliberately; update documentation exceptions in `.gitignore` when adding public docs. The scanner does not discover or approve unlisted files. The check rejects broken relative Markdown file/heading links, recognizable sensitive paths/tokens, and source maps. Pattern scanning is not a full secret scanner or proof that data is safe; inspect actual publication files and the artifact manually.

For offline installation and compiled-consumer validation, see [CI notes](CI.md). Tests clean temporary directories. The manual performance script is not part of CI or normal checks. No scheduled campaign is configured.
