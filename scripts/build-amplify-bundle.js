"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const amplifyDir = path.join(rootDir, ".amplify-hosting");
const computeDir = path.join(amplifyDir, "compute", "default");

const requiredPaths = [
  "server.js",
  "package.json",
  "package-lock.json",
  "lib",
  "public",
  "node_modules"
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyPath(relativePath) {
  const src = path.join(rootDir, relativePath);
  const dest = path.join(computeDir, relativePath);

  if (!fs.existsSync(src)) {
    throw new Error(`Missing required path: ${relativePath}`);
  }

  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true });
}

function buildAmplifyBundle() {
  cleanDir(amplifyDir);
  ensureDir(computeDir);

  for (const requiredPath of requiredPaths) {
    copyPath(requiredPath);
  }

  fs.copyFileSync(
    path.join(rootDir, "deploy-manifest.json"),
    path.join(amplifyDir, "deploy-manifest.json")
  );
}

try {
  buildAmplifyBundle();
  console.log("Amplify bundle created in .amplify-hosting");
} catch (error) {
  console.error(`Amplify bundle failed: ${error.message}`);
  process.exit(1);
}
