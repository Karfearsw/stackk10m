## Why You See This
- `package.json` has `"engines": { "node": ">=20" }`. On Vercel, semver ranges that include future majors (e.g., `>=20`) allow automatic upgrades when Node 21/22/24 becomes available, which triggers the warning.
- Vercel recommends pinning to a major like `"20.x"` to avoid unexpected major jumps ([Vercel docs](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).

## Recommended Approach
- Pin the Node.js major version: set `"engines": { "node": "20.x" }` in `package.json`.
- Add a workspace version file for local/dev tooling consistency: `.nvmrc` or `.node-version` with `20` (or a stricter `20.9`, etc.). This helps CI and developers stay aligned ([Conformance rule](https://vercel.com/docs/conformance/rules/REQUIRE_NODE_VERSION_FILE)).
- Optionally, align Vercel Project Settings → Node.js Version to `20.x`. Note: `package.json engines.node` takes precedence over the UI setting.

## Steps
1. Edit `FrameworkPlanner/package.json`: change `engines.node` from `">=20"` to `"20.x"`.
2. Create `.nvmrc` (and optionally `.node-version`) at repo root with `20`.
3. Push changes and redeploy.
4. Verify version in logs:
   - Print `process.version` during build/start or run `node -v` in the Build Command.
   - Confirm the Vercel deployment shows Node 20.x.

## Impact & Notes
- Prevents surprise upgrades to Node 21/22/24 that could break native deps or runtime behavior.
- Minor/patch updates under `20.x` still roll out automatically on Vercel; that’s typically safe.
- If you need stricter pinning (e.g., `20.9.x`), we can adopt that, but Vercel only selects majors; `engines.node` expressed as `20.x` is the supported convention for deployments.