# Action Plan: Force Rebuild & Fix Caching

I will execute the **"Force Rebuild"** and **"Cache Fix"** steps from your plan simultaneously. This ensures Vercel picks up the latest code and browsers don't hold onto stale versions.

## 1. Update `vercel.json`
I will configure explicit caching rules to prevent stale deployments:
- **`index.html`**: `no-cache` (must revalidate with server to get the latest bundle hash).
- **Static Assets**: `immutable` (cache forever, since filenames contain hashes like `dialer-Cii6mVfq.js`).

## 2. Push Changes
This commit will trigger a **fresh Vercel deployment**, effectively forcing the rebuild you need.

## 3. Your Part (After I Push)
Once I push, wait ~2 minutes for Vercel to finish, then:
1. **Hard Refresh** your browser.
2. **Verify**: The error should disappear as the new `dialer-*.js` loads.

Let's proceed with updating `vercel.json`.