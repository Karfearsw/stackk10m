<<<<<<< HEAD
import app from "../FrameworkPlanner/dist-server/vercel.js";

export default app;
=======
let cached: any | null = null;
let cachedPromise: Promise<any> | null = null;

async function loadHandler(): Promise<any> {
  if (cached) return cached;
  if (!cachedPromise) {
    const url = new URL("../FrameworkPlanner/dist-server/vercel.js", import.meta.url);
    cachedPromise = import(url.href).then((m: any) => {
      cached = m?.default ?? m;
      return cached;
    });
  }
  return cachedPromise;
}

export default async function handler(req: any, res: any) {
  const h = await loadHandler();
  return h(req, res);
}
>>>>>>> origin/main
