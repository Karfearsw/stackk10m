# Root Cause Analysis & Diagnostic Plan

The code in `useSignalWire.ts` has been updated to use the Browser SDK (`SignalWire({ token })` and `client.dial()`), which is correct for `@signalwire/js` v3+. However, the error `TypeError: (void 0) is not a function` at runtime suggests that either:
1.  **Stale Code**: The browser is running an old version of the bundle where `createClient` (or similar) was called.
2.  **SDK Initialization Failure**: The `SignalWire` constructor or `client.dial` method is failing or missing in the loaded module.
3.  **Module Loading Issue**: The dynamic import `await import("@signalwire/js")` might be returning a module structure different from what we expect (e.g., `default` export vs named export).

## Proposed Action: Add Comprehensive Diagnostics

I will inject detailed logging into `useSignalWire.ts` to trace the exact state of the SignalWire SDK at runtime. This will definitively reveal if we are running fresh code and what the SDK object looks like.

### Diagnostic Changes to `useSignalWire.ts`
-   **Log SDK Import**: Log the entire `SW` object returned by `import("@signalwire/js")` to confirm exports.
-   **Log Constructor**: Log `typeof SignalWire` before calling it.
-   **Log Client Instance**: Log the `client` object keys after initialization.
-   **Log Dial Method**: Log `typeof (relayRef.current as any)?.dial` before calling it.
-   **Log Execution Flow**: Add "STEP 1", "STEP 2" logs to trace execution path.

### Deployment Plan
1.  **Modify Code**: Apply the logging patch to `client/src/hooks/useSignalWire.ts`.
2.  **Commit & Push**: Trigger a new Vercel deployment.
3.  **Verify**:
    -   Wait for deployment to finish.
    -   Hard refresh the browser.
    -   Open Console and attempt a call.
    -   Analyze the logs:
        -   If logs appear: We are running new code. The content of the logs will pinpoint the missing function.
        -   If NO logs appear: We are *still* serving stale assets (caching issue).

This eliminates the guesswork about "stale code" vs "broken code".

## Step-by-Step Implementation
1.  **Edit `useSignalWire.ts`** to add the diagnostic logs.
2.  **Commit and Push** to `dialer-signalwire-fix` branch.
3.  **Wait for Vercel** to build.
4.  **Test** and report findings.