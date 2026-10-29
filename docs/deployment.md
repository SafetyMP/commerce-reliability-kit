# GitHub Pages deployment and rollback

The confirmed repository is [SafetyMP/commerce-reliability-kit](https://github.com/SafetyMP/commerce-reliability-kit), with default/deployment branch `main`. The project subpath is `/commerce-reliability-kit/`. No live URL or deployment success is claimed here; use the URL returned by a successful deployment and verify it before adding it to the README and repository homepage.

## Validation and promotion

[The workflow](../.github/workflows/pages.yml) validates pushes to main, pull requests targeting main, and manual dispatches. It installs both lockfiles with `npm ci --ignore-scripts`, checks root types, runs product and portable contract tests, builds the toolkit, tests the demo, runs its gate, checks publication files, then typechecks/builds the demo and checks the output. No lint script exists. Node 22.23.2 and the existing npm lockfiles/toolchain are retained.

PR validation uses `/commerce-reliability-kit/` without calling the Pages API. Only a push or manual dispatch **on main** reads `configure-pages` metadata, uploads, and deploys. Other manual refs validate only. Metadata `base_path` is normalized to a trailing slash; an empty root/custom-domain path becomes `/`. Vite also accepts `PAGES_BASE_PATH` or CLI `--base`; its local default is `./`. Never guess a new repository or custom-domain base.

The build job has `contents: read`. Only the dependent deploy job has `pages: write` and `id-token: write`, uses the `github-pages` environment, and exposes `page_url`. It has no checkout or rebuild: it deploys the same `apps/demo/dist` artifact checked in that run. No PR upload/deploy, `pull_request_target`, PAT, deployment branch, or generated root toolkit output is used. A deployment concurrency group serializes publishes without canceling an active deploy. Observe the deployed revision when dispatching older runs; concurrency is not a promise that an older queued run cannot publish later.

## Initial publication

An authorized owner must inspect the actual remote, publication file inventory, applicable reviews/checks, and any existing Pages configuration before pushing. Keep current branch/environment protections. Configure repository Pages source to **GitHub Actions** before the first deployable run: metadata configuration intentionally does not enable Pages or require extra write permission. Confirm this project's site before changing settings; do not replace an unrelated site, alter domains/DNS, or change visibility.

Run `node scripts/publication-check.mjs --check`, review `--list` or `--json`, and inspect the artifact and any existing history separately. The explicit inventory is the publication boundary. Local instructions remain on disk; internal requests, review records, receipts, caches, dependency trees, and host launchers stay local. Ignore rules do not untrack existing files; the publisher must inspect the actual proposed commit set. Pattern scanning is not a full secret scanner, image review, license audit, or history inspection.

Push the reviewed change through the repository's permitted branch/PR process. Respect required review and environment approval; do not bypass them. Inspect the workflow result and deployment output rather than treating a successful push as a deployment. Record source commit, run URL, deployment URL, verification time, and checks. Local checks, CI checks, deployment success, and live browser acceptance are separate facts.

## Production and live acceptance

Build with the intended base, inspect it, and preview as in [development](development.md). In a browser, exercise the actual production output at the subpath, then repeat on the URL returned by Pages:

- Root and `#library`, `#workbench`, `#report`, `#compare` direct navigation, refresh, invalid hash fallback, back/forward, and honest empty states after refresh.
- JavaScript, CSS, favicon, and embedded fixtures load; no unexpected console errors or runtime external requests. Block external requests while allowing same-origin assets for the local production journey.
- Search/filter, faulty partial shipment (5/3/2), evidence inspection, corrected run, comparison, stale-evidence INCONCLUSIVE, and inventory-buffer policy.
- Actual JSON and standalone HTML downloads, visible synthetic disclosure, real repository/documentation links under About this demo, keyboard focus/skip link, desktop and narrow layouts.

No service worker or offline/PWA support is claimed. If browser verification is unavailable, report that separately; a static artifact check does not replace it. Publish only appropriate synthetic screenshots. Keep the real comparison screenshot updated when the UI changes and manually inspect it for private content.

## Failure diagnosis and rollback

For install failures, check Node/npm versions and lockfiles without replacing locked dependencies opportunistically. For metadata failures, confirm repository identity, Pages Actions source, and read permissions. For missing assets, compare configure-pages `base_path`, the generated index references, and uploaded directory. For deploy failures, inspect artifact/run identity, environment approvals, Pages/OIDC permissions, and concurrency. Fix the specific failure and rerun through the normal workflow; do not weaken required checks.

To restore a known-good revision, revert the faulty change through the normal reviewed process on main, preserving history, then allow the workflow to rebuild, validate, and deploy that revision. Record the new commit and run. A manual main dispatch can redeploy the current main revision through all checks. Do not force-push, rewrite history, or deploy an unchecked local folder. Reverify the live site after rollback.

## Maintenance and sources

Review both lockfiles for dependency updates, run all checks, and repeat browser acceptance when behavior/assets change. Keep synthetic fixture expectations independent of evaluator output. Updating action pins requires verifying the release and tag commit against the official repository, keeping a readable version comment, and validating runner compatibility.

Official deployment/community references were retrieved by the coordinator on **2026-10-28**:

- [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite static deployment](https://vite.dev/guide/static-deploy)
- [Healthy contribution guidance](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions)
- [Private vulnerability reporting configuration](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)

The coordinator verified official release tags and commit SHAs for checkout v7.0.1, setup-node v7.1.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, and deploy-pages v5.0.1. Those immutable revisions are recorded in the workflow. Documentation samples differ in action versions; future upgrades require fresh verification. Historical product research dates in [SOURCES.md](SOURCES.md) are preserved and are not deployment-tool version cutoffs.
