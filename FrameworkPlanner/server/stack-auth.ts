import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";

// Ensure environment variables are loaded
const JWKS_URL = process.env.STACK_JWKS_URL;
const PROJECT_ID = process.env.STACK_PROJECT_ID;

if (!JWKS_URL) {
  console.warn("⚠️ STACK_JWKS_URL is not defined. Stack Auth middleware will not function.");
}

// Initialize the JWKS set (Remote JSON Web Key Set)
// This handles caching and refreshing keys automatically
const JWKS = JWKS_URL ? createRemoteJWKSet(new URL(JWKS_URL)) : null;

export interface StackAuthUser {
  sub: string;
  email?: string;
  // Add other claims as needed based on Stack Auth token structure
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      stackUser?: StackAuthUser;
    }
  }
}

export async function requireStackAuth(req: Request, res: Response, next: NextFunction) {
  if (!JWKS) {
    console.error("Stack Auth middleware called but JWKS is not configured.");
    return res.status(500).json({ message: "Server authentication configuration error" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: Missing Bearer token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      // If we want to strictly verify the issuer (recommended if Stack Auth provides a consistent issuer)
      // issuer: `https://api.stack-auth.com/...` 
    });

    req.stackUser = payload as StackAuthUser;
    next();
  } catch (error: any) {
    console.error("Stack Auth token verification failed:", error.message);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
}
