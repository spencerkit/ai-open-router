#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

function parseArgs(argv) {
  let inputDir = "release-artifacts"
  let outputPath = path.join(inputDir, "latest.json")

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "--input") {
      const next = argv[i + 1]
      if (!next) throw new Error("Missing value for --input")
      inputDir = next
      i += 1
      continue
    }
    if (token === "--output") {
      const next = argv[i + 1]
      if (!next) throw new Error("Missing value for --output")
      outputPath = next
      i += 1
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }

  return { inputDir, outputPath }
}

function readManifest(filePath) {
  const raw = fs.readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Updater manifest must be an object: ${filePath}`)
  }
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error(`Updater manifest missing version: ${filePath}`)
  }
  if (!parsed.platforms || typeof parsed.platforms !== "object" || Array.isArray(parsed.platforms)) {
    throw new Error(`Updater manifest missing platforms map: ${filePath}`)
  }
  return parsed
}

function mergeManifest(base, incoming, filePath) {
  if (base.version !== incoming.version) {
    throw new Error(
      `Updater version mismatch in ${filePath}: ${incoming.version} != ${base.version}`
    )
  }

  if (incoming.notes) {
    if (!base.notes) {
      base.notes = incoming.notes
    } else if (base.notes !== incoming.notes) {
      throw new Error(`Updater notes mismatch in ${filePath}`)
    }
  }

  if (incoming.pub_date) {
    if (!base.pub_date || incoming.pub_date > base.pub_date) {
      base.pub_date = incoming.pub_date
    }
  }

  for (const [platform, value] of Object.entries(incoming.platforms)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Updater platform entry must be an object: ${filePath} (${platform})`)
    }
    if (!base.platforms[platform]) {
      base.platforms[platform] = value
      continue
    }
    if (JSON.stringify(base.platforms[platform]) !== JSON.stringify(value)) {
      throw new Error(`Updater platform entry mismatch in ${filePath} (${platform})`)
    }
  }
}

function collectManifestPaths(rootDir) {
  const paths = []

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const nextPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        visit(nextPath)
        continue
      }
      if (/^latest-[^.]+\.json$/.test(entry.name)) {
        paths.push(nextPath)
      }
    }
  }

  visit(rootDir)
  paths.sort()
  return paths
}

function main() {
  const { inputDir, outputPath } = parseArgs(process.argv.slice(2))
  const manifestPaths = collectManifestPaths(inputDir)

  if (manifestPaths.length === 0) {
    throw new Error(`No per-platform updater manifests found in ${inputDir}`)
  }

  const first = readManifest(manifestPaths[0])
  const merged = {
    version: first.version,
    notes: first.notes,
    pub_date: first.pub_date,
    platforms: { ...first.platforms },
  }

  for (const manifestPath of manifestPaths.slice(1)) {
    mergeManifest(merged, readManifest(manifestPath), manifestPath)
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(`Merged updater manifest: ${outputPath}`)
}

main()
