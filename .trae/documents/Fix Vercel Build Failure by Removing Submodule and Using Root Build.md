## Problem
- Vercel build fails with ENOENT: `/FrameworkPlanner/package.json` not found. The repository currently tracks `FrameworkPlanner` as a git submodule (`mode 160000`), so Vercel’s clone does not include its contents unless submodules are fetched.

## Plan
1) Replace the submodule with regular tracked files:
   - Remove submodule references (`.gitmodules`, submodule config) and re-add the actual `FrameworkPlanner` folder contents to the main repo.
   - Commit the change so GitHub contains `FrameworkPlanner` files, not a submodule link.
2) Keep root build scripts:
   - Root `package.json` has `build: npm --prefix FrameworkPlanner run build`; leave as-is.
3) Vercel settings:
   - Project Root: repository root.
   - Build Command: `npm run build` (or `npm --prefix FrameworkPlanner run build` if you prefer direct).
   - Node.js Version: `20.x` (already set).
4) Redeploy and verify build completes and the site serves correctly.

## Steps I’ll Perform
- Remove submodule and commit real `FrameworkPlanner` sources to the repo.
- Push to GitHub on the same branch (`dialer-signalwire-fix`).
- You adjust Vercel Build Command if needed, then trigger redeploy.

## Verification
- Build logs show `npm run build` completing with `dist/` and `dist-server/index.js`.
- Dialer loads without SignalWire errors and `PATCH /api/telephony/calls/:id` returns 200.
- No more ENOENT for `FrameworkPlanner/package.json` in Vercel logs.