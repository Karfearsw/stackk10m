import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const frameworkRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(frameworkRoot, "..");

const candidateFiles = [
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, ".env"),
  path.join(frameworkRoot, ".env.local"),
  path.join(frameworkRoot, ".env"),
];

for (const filePath of candidateFiles) {
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false });
}
