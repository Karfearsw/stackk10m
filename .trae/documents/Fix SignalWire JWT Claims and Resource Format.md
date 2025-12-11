I have analyzed the logs and the "401 Unauthorized" error persists. This indicates that while the JSON format is now valid (no scientific notation), the **content** of the JWT claims is likely rejected by SignalWire.

The `resource` claim in SignalWire JWTs is typically expected to be a **string identifier** (the identity of the client, e.g., the `from` phone number or a username), not a complex capability object like `{ type: 'call', ... }`. Passing an object may be causing the validation failure.

### Plan:
1.  **Modify `server/routes.ts`**:
    *   Change the `resource` claim in the JWT payload to be a simple **string** (the `from` number). This identifies the client as that phone number.
    *   Ensure the API token and Project ID are trimmed of whitespace.
    *   Add server-side logging of the generated JWT payload for debugging.

2.  **Verify Client Logic**:
    *   The client-side `useSignalWire.ts` logic seems correct (`host` handling is good).
    *   I will rely on the server-side fix to resolve the 401.

This change aligns with standard SignalWire Relay authentication where `resource` defines "who is connecting".
