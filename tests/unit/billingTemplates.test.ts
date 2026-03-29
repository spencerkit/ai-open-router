import assert from "node:assert/strict"
import { test } from "node:test"

import {
  applyBillingTemplateToCost,
  canApplyBillingTemplate,
  doesCostMatchBillingTemplate,
  findBillingTemplate,
  searchBillingTemplates,
} from "../../src/renderer/utils/billingTemplates"

test("searchBillingTemplates matches vendor, model, and alias text", () => {
  assert.equal(
    searchBillingTemplates("gpt-4o").some(item => item.modelId === "gpt-4o"),
    true
  )
  assert.equal(
    searchBillingTemplates("claude sonnet").some(item => item.vendorId === "anthropic"),
    true
  )
  assert.equal(
    searchBillingTemplates("glm5").some(item => item.modelId === "glm-5"),
    true
  )
})

test("applyBillingTemplateToCost only overwrites defined fields for partial templates", () => {
  const template = findBillingTemplate("openai", "gpt-4o")
  assert.ok(template)

  const next = applyBillingTemplateToCost(
    {
      enabled: true,
      inputPricePerM: 9,
      outputPricePerM: 9,
      cacheInputPricePerM: 9,
      cacheOutputPricePerM: 7,
      currency: "USD",
    },
    template,
    "2026-03-29T00:00:00.000Z"
  )

  assert.equal(next.inputPricePerM, 2.5)
  assert.equal(next.outputPricePerM, 10)
  assert.equal(next.cacheInputPricePerM, 1.25)
  assert.equal(next.cacheOutputPricePerM, 7)
  assert.equal(next.template?.vendorId, "openai")
  assert.equal(next.template?.modifiedAfterApply, false)
})

test("canApplyBillingTemplate returns false for official but unpriced placeholders", () => {
  const template = findBillingTemplate("zhipu", "glm-5")
  assert.ok(template)
  assert.equal(canApplyBillingTemplate(template), false)
})

test("doesCostMatchBillingTemplate detects modified pricing against the seeded template", () => {
  const template = findBillingTemplate("anthropic", "claude-sonnet-4-5")
  assert.ok(template)

  assert.equal(
    doesCostMatchBillingTemplate(
      {
        enabled: true,
        inputPricePerM: 3,
        outputPricePerM: 15,
        cacheInputPricePerM: 0.3,
        cacheOutputPricePerM: 3.75,
        currency: "USD",
      },
      template
    ),
    true
  )

  assert.equal(
    doesCostMatchBillingTemplate(
      {
        enabled: true,
        inputPricePerM: 4,
        outputPricePerM: 15,
        cacheInputPricePerM: 0.3,
        cacheOutputPricePerM: 3.75,
        currency: "USD",
      },
      template
    ),
    false
  )
})
