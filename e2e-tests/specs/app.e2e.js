describe("AI Open Router", () => {
  const groupId = "e2e"
  const groupName = "E2E Group"
  const providerName = "E2E Provider"
  const providerModel = "gpt-4o-mini"
  const providerExtraModel = "gpt-4.1-mini"

  const selectors = {
    errorScreen: ".error-screen",
    firstRunTitle: '//h2[contains(., "Start by creating your first group")]',
    groupInfoTitle: '//h3[contains(., "Group Info")]',
    addGroupButton: '//button[@aria-label="Add Group" or @title="Add Group"]',
    createFirstGroupButton: '//button[contains(., "Create First Group")]',
    createModalButton: '//button[normalize-space()="Create"]',
    providersNav: '//button[.//span[normalize-space()="Providers"]]',
    serviceNav: '//button[.//span[normalize-space()="Service"]]',
    logsNav: '//button[.//span[normalize-space()="Logs"]]',
    addProviderButton: '//button[normalize-space()="Add Provider"]',
    createProviderButton: '//button[normalize-space()="Create Provider"]',
    editGroupButton: '//button[@aria-label="Edit Group" or @title="Edit Group"]',
    addRouteButton: '//button[contains(normalize-space(), "Add Route")]',
    saveButton: '//button[normalize-space()="Save"]',
    logsTitle: '//h2[normalize-space()="Logs"]',
  }

  const groupPathSelector = id => `//span[normalize-space()="/${id}"]`
  const groupButtonSelector = id => `//button[.//span[normalize-space()="/${id}"]]`
  const providerNameSelector = name => `//span[normalize-space()="${name}"]`

  async function waitForExisting(selector, timeout = 15000) {
    await browser.waitUntil(async () => (await $$(selector)).length > 0, {
      timeout,
      timeoutMsg: `Element did not appear: ${selector}`,
    })
  }

  async function safeClick(selector) {
    const el = await $(selector)
    await el.waitForExist({ timeout: 15000 })
    try {
      await el.click()
    } catch {
      await browser.execute(target => target.click(), el)
    }
  }

  async function waitForReady() {
    await browser.waitUntil(
      async () => {
        const errorScreen = await $(selectors.errorScreen)
        if (await errorScreen.isExisting()) return true
        const firstRunTitle = await $(selectors.firstRunTitle)
        if (await firstRunTitle.isExisting()) return true
        const groupInfo = await $(selectors.groupInfoTitle)
        return groupInfo.isExisting()
      },
      {
        timeout: 30000,
        timeoutMsg: "App did not reach a ready state within 30s",
      }
    )

    const errorScreen = await $(selectors.errorScreen)
    if (await errorScreen.isExisting()) {
      const message = await errorScreen.getText()
      throw new Error(`App bootstrap failed: ${message || "unknown error"}`)
    }
  }

  async function ensureEnglish() {
    const enButton = await $('//button[normalize-space()="EN"]')
    if (await enButton.isExisting()) {
      await enButton.click()
    }
  }

  async function ensureGroup() {
    const groupPath = await $(groupPathSelector(groupId))
    if (!(await groupPath.isExisting())) {
      const createFirst = await $(selectors.createFirstGroupButton)
      if (await createFirst.isExisting()) {
        await safeClick(selectors.createFirstGroupButton)
      } else {
        await safeClick(selectors.addGroupButton)
      }

      const groupIdInput = await $("#groupId")
      await groupIdInput.waitForExist({ timeout: 10000 })
      await groupIdInput.setValue(groupId)
      await $("#groupName").setValue(groupName)

      await safeClick(selectors.createModalButton)
      await $(groupPathSelector(groupId)).waitForExist({ timeout: 15000 })
    }

    await safeClick(groupButtonSelector(groupId))
  }

  async function addModelTag(model) {
    const modelInput = 'input[placeholder="e.g. gpt-4.1-mini"]'
    await waitForExisting(modelInput)
    await $(modelInput).setValue(model)
    await safeClick('//button[normalize-space()="Add Model"]')
  }

  async function setReactInputValue(selector, value) {
    const input = await $(selector)
    await input.waitForExist({ timeout: 15000 })
    await browser.execute(
      (element, nextValue) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set
        nativeSetter?.call(element, nextValue)
        element.dispatchEvent(new Event("input", { bubbles: true }))
        element.dispatchEvent(new Event("change", { bubbles: true }))
      },
      input,
      value
    )
  }

  async function ensureProviderExists() {
    await safeClick(selectors.providersNav)
    const providersTitle = await $('//h2[normalize-space()="Providers"]')
    await providersTitle.waitForExist({ timeout: 15000 })

    const providerNameEl = await $(providerNameSelector(providerName))
    if (!(await providerNameEl.isExisting())) {
      await safeClick(selectors.addProviderButton)

      await waitForExisting("#name")
      await $("#name").setValue(providerName)
      await $("#token").setValue("sk-e2e")
      await $("#apiAddress").setValue("https://api.openai.com/v1")

      const openaiButton = await $('//button[normalize-space()="OpenAI"]')
      if (await openaiButton.isExisting()) {
        await safeClick('//button[normalize-space()="OpenAI"]')
      }

      await addModelTag(providerModel)
      await addModelTag(providerExtraModel)

      await safeClick(selectors.createProviderButton)
      await $(providerNameSelector(providerName)).waitForExist({ timeout: 15000 })
      await $('//span[normalize-space()="Models:"]').waitForExist({ timeout: 15000 })
      await $(providerNameSelector(providerExtraModel)).waitForExist({ timeout: 15000 })
    }
  }

  async function selectByVisibleText(selector, text) {
    const select = await $(selector)
    await select.waitForExist({ timeout: 15000 })
    await select.selectByVisibleText(text)
  }

  async function readRoutingRows() {
    const rows = await $$("tbody tr")
    const result = []

    for (const row of rows) {
      const textInputs = await row.$$('input[type="text"]')
      const selects = await row.$$("select")
      const requestModel = textInputs[0] ? await textInputs[0].getValue() : ""
      const providerValue = selects[0] ? await selects[0].getValue() : ""
      const targetModel = selects[1] ? await selects[1].getValue() : ""

      result.push({
        requestModel,
        targetModel,
        providerValue,
      })
    }

    return result
  }

  async function ensureRoutingConfigured() {
    await safeClick(selectors.serviceNav)
    await waitForExisting(selectors.groupInfoTitle)
    await waitForExisting('//h3[normalize-space()="Routing Table"]')
    await waitForExisting('//span[normalize-space()="Locked"]')

    let rows = await $$("tbody tr")
    if (rows.length < 1) {
      throw new Error("service page should render at least the default routing row")
    }

    await selectByVisibleText('(//tbody//tr)[1]//select[@aria-label="Provider 1"]', providerName)
    await browser.waitUntil(
      async () =>
        !(await $('(//tbody//tr)[1]//select[@aria-label="Target model 1"]').getAttribute(
          "disabled"
        )),
      {
        timeout: 15000,
        timeoutMsg: "default target model select should be enabled after provider selection",
      }
    )
    await $('(//tbody//tr)[1]//select[@aria-label="Target model 1"]').selectByAttribute(
      "value",
      providerModel
    )

    await safeClick(selectors.addRouteButton)
    await browser.waitUntil(async () => (await $$("tbody tr")).length >= 2, {
      timeout: 15000,
      timeoutMsg: "adding a route should append a new routing row",
    })

    rows = await $$("tbody tr")
    await setReactInputValue('(//tbody//tr)[2]//input[@aria-label="Request model 2"]', "sonnet")
    await selectByVisibleText('(//tbody//tr)[2]//select[@aria-label="Provider 2"]', providerName)
    await browser.waitUntil(
      async () =>
        !(await $('(//tbody//tr)[2]//select[@aria-label="Target model 2"]').getAttribute(
          "disabled"
        )),
      {
        timeout: 15000,
        timeoutMsg: "custom route target model select should be enabled after provider selection",
      }
    )
    await $('(//tbody//tr)[2]//select[@aria-label="Target model 2"]').selectByVisibleText(
      "gpt-4.1-mini"
    )

    const templateSelect = await $('//select[@aria-label="Routing template"]')
    await templateSelect.selectByAttribute("value", "codex")
    await browser.waitUntil(async () => (await $$("tbody tr")).length >= 5, {
      timeout: 15000,
      timeoutMsg: "template fill should append codex routes",
    })

    await selectByVisibleText('(//tbody//tr)[3]//select[@aria-label="Provider 3"]', providerName)
    await browser.waitUntil(
      async () =>
        !(await $('(//tbody//tr)[3]//select[@aria-label="Target model 3"]').getAttribute(
          "disabled"
        )),
      {
        timeout: 15000,
        timeoutMsg: "template route target model select should be enabled after provider selection",
      }
    )
    await $('(//tbody//tr)[3]//select[@aria-label="Target model 3"]').selectByAttribute(
      "value",
      providerExtraModel
    )

    await safeClick(selectors.saveButton)
    await waitForExisting(selectors.groupInfoTitle)
    await waitForExisting('//h3[normalize-space()="Routing Table"]')

    const persistedRows = await readRoutingRows()
    const defaultRow = persistedRows.find(row => row.requestModel === "default")
    const customRow = persistedRows.find(row => row.requestModel === "sonnet")

    if (!defaultRow) {
      throw new Error("default routing row should persist after saving")
    }
    if (!customRow) {
      throw new Error("custom routing row should persist after saving")
    }
    if (defaultRow.targetModel !== providerModel) {
      throw new Error(
        `default target model should persist after saving (got: ${defaultRow.targetModel || "<empty>"})`
      )
    }
    if (customRow.targetModel !== providerExtraModel) {
      throw new Error(
        `custom target model should persist after saving (got: ${customRow.targetModel || "<empty>"})`
      )
    }
  }

  it("covers the main flow", async () => {
    await waitForReady()

    const title = await browser.getTitle()
    expect(title).toBe("AI Open Router")

    await ensureEnglish()
    await ensureGroup()
    await ensureProviderExists()
    await ensureRoutingConfigured()

    await safeClick(selectors.logsNav)
    await $(selectors.logsTitle).waitForExist({ timeout: 15000 })
  })

  describe("Group provider list cleanup", () => {
    /**
     * Test 1: Group detail page has no inline provider list
     *
     * The legacy ServicePage/ProviderList component (which showed an h3 "Rule Name")
     * was removed. The GroupEditPage should NOT contain any provider list section,
     * "Rule Name" heading, or "Add Provider" button.
     */
    it("Group detail page has no inline provider list", async () => {
      await waitForReady()
      await browser.url(`#/groups/${groupId}/edit`)

      // Verify the group edit form loads
      const editTitle = await $('//h1[normalize-space()="Group Edit"]')
      await editTitle.waitForExist({ timeout: 15000 })
      const groupIdInput = await $("#groupId")
      await groupIdInput.waitForExist({ timeout: 10000 })
      await expect(groupIdInput).toHaveValue(groupId)

      // There must be no "Rule Name" text anywhere on the page (removed ProviderList h3)
      const ruleNameEls = await $$(
        '//*[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "rule name")]'
      )
      expect(ruleNameEls).toHaveLength(0)

      // There must be no "Add Provider" button on the group edit page
      const addProviderBtns = await $$('//button[normalize-space()="Add Provider"]')
      expect(addProviderBtns).toHaveLength(0)
    })

    /**
     * Test 2: Creating a provider is visible in the Providers page and routingTable
     *
     * Providers are stored globally. After creating a provider, it must appear
     * in the Provider dropdown within the group routing table.
     */
    it("Creating a provider is visible in the routingTable Provider dropdown", async () => {
      const freshProviderName = "E2E Fresh Provider"

      // Navigate to Providers page and create a fresh provider
      await safeClick(selectors.providersNav)
      const providersTitle = await $('//h2[normalize-space()="Providers"]')
      await providersTitle.waitForExist({ timeout: 15000 })

      const freshProviderEl = await $(providerNameSelector(freshProviderName))
      if (!(await freshProviderEl.isExisting())) {
        await safeClick(selectors.addProviderButton)
        await waitForExisting("#name")
        await $("#name").setValue(freshProviderName)
        await $("#token").setValue("sk-e2e-fresh")
        await $("#apiAddress").setValue("https://api.openai.com/v1")

        const openaiBtn = await $('//button[normalize-space()="OpenAI"]')
        if (await openaiBtn.isExisting()) {
          await safeClick('//button[normalize-space()="OpenAI"]')
        }

        await addModelTag("claude-3-5-sonnet")
        await safeClick(selectors.createProviderButton)
        await $(providerNameSelector(freshProviderName)).waitForExist({ timeout: 15000 })
      }

      // Navigate to the ServicePage routing table
      await safeClick(selectors.serviceNav)
      await waitForExisting(selectors.groupInfoTitle)

      // Wait for the routing table to be visible
      await waitForExisting('//h3[normalize-space()="Routing Table"]')

      // Verify the fresh provider appears in the first row's Provider dropdown
      const firstProviderSelect = await $('(//tbody//tr)[1]//select[@aria-label="Provider 1"]')
      await firstProviderSelect.waitForExist({ timeout: 15000 })

      // Find all options in the provider dropdown
      const options = await firstProviderSelect.$$("option")
      const optionTexts = await Promise.all(options.map(opt => opt.getText()))
      expect(optionTexts).toContain(freshProviderName)
    })

    /**
     * Test 3: Sidebar rule count reflects routingTable entries
     *
     * The sidebar group item badge shows the count of non-empty routes
     * (routes where providerId is set), computed from routingTable.
     */
    it("Sidebar rule count reflects routingTable entries", async () => {
      // ensureRoutingConfigured was already run by the main flow (adds 5 rows, 5 with providerId)
      await safeClick(selectors.serviceNav)
      await waitForExisting(selectors.groupInfoTitle)
      await waitForExisting('//h3[normalize-space()="Routing Table"]')

      // Count how many routing rows have a non-empty provider selected
      const rows = await $$("tbody tr")
      let configuredRowCount = 0
      for (const row of rows) {
        const selects = await row.$$("select")
        if (selects.length > 0) {
          const providerVal = await selects[0].getValue()
          if (providerVal && providerVal.trim() !== "") {
            configuredRowCount++
          }
        }
      }

      // The sidebar active group badge must show the same count
      const activeGroupButton = await $(
        '//button[contains(@class, "groupItem")][contains(@class, "active")]'
      )
      await activeGroupButton.waitForExist({ timeout: 15000 })
      const badge = await activeGroupButton.$('span[class*="groupRuleCount"]')
      await badge.waitForExist({ timeout: 5000 })
      const badgeText = await badge.getText()
      const sidebarCount = parseInt(badgeText.trim(), 10)
      expect(sidebarCount).toBe(configuredRowCount)

      // Add one more route and verify the count increments
      await safeClick(selectors.addRouteButton)
      await browser.waitUntil(async () => (await $$("tbody tr")).length >= rows.length + 1, {
        timeout: 15000,
        timeoutMsg: "adding a route should increase row count",
      })
      await browser.waitUntil(
        async () => (await $$("tbody tr")).length === configuredRowCount + 1,
        { timeout: 5000 }
      )

      // Save the updated routing table
      await safeClick(selectors.saveButton)
      await waitForExisting('//h3[normalize-space()="Routing Table"]')

      // Re-read the active group badge — it should be one higher
      const updatedBadge = await activeGroupButton.$('span[class*="groupRuleCount"]')
      await updatedBadge.waitForExist({ timeout: 5000 })
      const updatedText = await updatedBadge.getText()
      const updatedSidebarCount = parseInt(updatedText.trim(), 10)
      expect(updatedSidebarCount).toBe(sidebarCount + 1)
    })
  })
})
