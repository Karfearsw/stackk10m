## What’s Happening
- The build warns about a duplicate key because `@signalwire/webrtc` appears twice in the same `dependencies` object in `FrameworkPlanner/package.json` (lines 54 and 76). Bundlers parse JSON as object literals; duplicate keys trigger `[duplicate-object-key]` and the last one shadows the first.
- There are no direct imports of `@signalwire/webrtc` in the app source; `@signalwire/js` already brings it transitively.

## Fix Options
- Minimal: keep a single `@signalwire/webrtc` entry and remove the duplicate.
- Preferred: remove both explicit entries and rely on `@signalwire/js`’s transitive dependency (since it is not directly imported).

## Steps
1. Edit `FrameworkPlanner/package.json`:
   - Either delete the duplicate at `FrameworkPlanner/package.json:76` and keep the one at `:54`, or delete both entries if preferring transitive resolution.
2. Run `npm i` to refresh `package-lock.json` and the install tree.
3. Restart dev/start scripts.

## Verification
- Start the app: `npm run dev` (and `npm run start` for server) and confirm the warning `[duplicate-object-key]` disappears.
- Check dependency resolution: `npm ls @signalwire/webrtc` should show it provided via `@signalwire/js` if removed from `package.json`.
- Smoke test any SignalWire functionality to ensure behavior is unchanged.

## Notes
- Duplicate keys in JSON lead to shadowing and non-deterministic intent; cleaning them avoids subtle resolution issues.
- If you prefer pinning `@signalwire/webrtc`, keep exactly one entry aligned with the version required by `@signalwire/js`.