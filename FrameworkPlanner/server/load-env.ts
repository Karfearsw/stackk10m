import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const frameworkRoot = path.resolve(__dirname, "..");

const candidateFiles = [
  path.join(frameworkRoot, ".env.local"),
  path.join(frameworkRoot, ".env"),
];

for (const filePath of candidateFiles) {
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false });
}
