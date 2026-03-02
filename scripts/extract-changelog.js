#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const rootDir = path.resolve(__dirname, "..")
const changelogPath = path.join(rootDir, "CHANGELOG.md")

function parseArgs(argv) {
  const out = { version: null, output: null }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "--version") {
      out.version = argv[i + 1]
      i += 1
    } else if (token === "--output") {
      out.output = argv[i + 1]
      i += 1
    } else {
      throw new Error(`Unknown argument: ${token}`)
    }
  }
  if (!out.version) {
    throw new Error("--version is required")
  }
  return out
}

function normalizeVersion(version) {
  return version.startsWith("v") ? version.slice(1) : version
}

function extractSection(changelog, version) {
  const escapedVersion = version.replace(/\./g, "\\.")
  const pattern = new RegExp(
    `^##\\s+v?${escapedVersion}\\b[\\s\\S]*?(?=\\n##\\s+v?\\d+\\.\\d+\\.\\d+\\b|$)`,
    "m"
  )
  const match = changelog.match(pattern)
  if (!match) {
    throw new Error(`Could not find changelog entry for version ${version}`)
  }
  return match[0].trim()
}

function main() {
  const { version, output } = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(changelogPath)) {
    throw new Error("CHANGELOG.md not found")
  }

  const changelog = fs.readFileSync(changelogPath, "utf8")
  const normalized = normalizeVersion(version)
  const section = extractSection(changelog, normalized)

  if (output) {
    fs.writeFileSync(output, `${section}\n`, "utf8")
  } else {
    process.stdout.write(`${section}\n`)
  }
}

main()
