import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod = require("../FrameworkPlanner/dist-server/vercel.js") as any;

export default mod?.default ?? mod;
