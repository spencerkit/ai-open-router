import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

const repoRoot = process.cwd()
const workflowPath = path.join(repoRoot, ".github/workflows/release-prepare.yml")

function extractReadVersionCommand() {
  const workflow = readFileSync(workflowPath, "utf8")
  const blockMatch = workflow.match(/- name: Read version[\s\S]*?run:\s*\|\n((?: {10}.+(?:\n|$))+)/)

  if (blockMatch) {
    return blockMatch[1]
      .split("\n")
      .filter(Boolean)
      .map(line => line.slice(10))
      .join("\n")
  }

  const inlineMatch = workflow.match(/- name: Read version[\s\S]*?run:\s*(.+)/)
  assert.ok(inlineMatch, "expected Read version step in release-prepare workflow")
  return inlineMatch[1].trim()
}

test("release-prepare Read version command is shell-safe", () => {
  const outputDir = path.join(repoRoot, ".tmp")
  const outputPath = path.join(outputDir, "github-output-test.txt")
  const command = extractReadVersionCommand()

  mkdirSync(outputDir, { recursive: true })

  assert.doesNotThrow(() => {
    execFileSync("bash", ["-n", "-c", command], {
      cwd: repoRoot,
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
      encoding: "utf8",
    })
  })
})
