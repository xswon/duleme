import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const distRoot = path.join(projectRoot, "dist");

const forbiddenNames = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".dev.vars",
  "credentials.json",
  "secrets.json",
]);

const secretPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
];

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

if (!fs.existsSync(distRoot)) {
  console.error("Sites artifact check failed: dist/ does not exist. Run npm run build:site first.");
  process.exitCode = 1;
} else {
  const errors: string[] = [];
  for (const filePath of walk(distRoot)) {
    const relative = path.relative(distRoot, filePath);
    const baseName = path.basename(filePath);
    if (
      forbiddenNames.has(baseName)
      || baseName.startsWith(".env.")
      || /\.(?:pem|key|p12|pfx)$/i.test(baseName)
    ) {
      errors.push(`${relative}: forbidden credential/config file in Site artifact.`);
      continue;
    }

    const stat = fs.statSync(filePath);
    if (stat.size > 20 * 1024 * 1024) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const candidate of secretPatterns) {
      if (candidate.pattern.test(content)) {
        errors.push(`${relative}: contains a value matching ${candidate.name}.`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Sites artifact check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("Sites artifact secret/config check passed.");
  }
}
