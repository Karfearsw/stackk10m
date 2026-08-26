// dist-server/vercel.js is generated at build time by `npm run build`
// (see FrameworkPlanner/server/scripts/vercel-build.ts) and is gitignored,
// so tsc cannot resolve declarations for it. The import is valid at deploy
// time; this only silences the TS7016 typecheck that Vercel runs on api/.
// @ts-expect-error - build artifact without declarations
import handler from "../FrameworkPlanner/dist-server/vercel.js";
export default handler;
