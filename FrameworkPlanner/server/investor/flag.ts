/**
 * Investor Portal feature flag.
 *
 * Everything in the investor portal (public signup/login, portal API, portal
 * UI routes) is gated behind INVESTOR_PORTAL_ENABLED. Default: OFF.
 *
 * Kept as its own module (rather than server/featureFlags.ts) so this
 * workstream touches zero shared files.
 */
import type { NextFunction, Request, Response } from "express";

export const INVESTOR_PORTAL_ENV = "INVESTOR_PORTAL_ENABLED";

/** POF gate for off-market inventory. Default true (see PRD 5.1). */
export const INVESTOR_POF_REQUIRED_ENV = "INVESTOR_POF_REQUIRED_FOR_OFFMARKET";

export function parsePortalEnvBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function isInvestorPortalEnabled(): boolean {
  return parsePortalEnvBool(process.env[INVESTOR_PORTAL_ENV]);
}

export function isPofRequiredForOffMarket(): boolean {
  const raw = process.env[INVESTOR_POF_REQUIRED_ENV];
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  return parsePortalEnvBool(raw);
}

/**
 * Express middleware: when the portal flag is OFF, every gated route
 * answers 404 so no public surface is reachable.
 */
export function investorPortalGuard(_req: Request, res: Response, next: NextFunction) {
  if (!isInvestorPortalEnabled()) {
    return res.status(404).json({
      code: "INVESTOR_PORTAL_DISABLED",
      message: "Not found",
    });
  }
  next();
}
