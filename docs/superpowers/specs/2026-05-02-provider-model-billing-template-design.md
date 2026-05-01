# Provider Model Billing Template Design

## Goal

Allow a single provider to assign independent billing templates and pricing to each configured target model, so request cost is calculated from the actual routed target model instead of a provider-wide shared price.

## Scope

This design changes provider billing from provider-level pricing to model-level pricing for `provider.models`.

In scope:

- Config schema for model-specific pricing
- Provider edit UX for model-specific template selection and price editing
- Runtime cost resolution based on routed `targetModel`
- Log and stats compatibility with model-specific cost snapshots
- Migration from existing provider-wide `cost`

Out of scope:

- Pricing by request alias such as `default` or `sonnet`
- Bulk import/export redesign beyond schema compatibility
- Cross-provider shared template presets beyond the current template catalog

## Current Problem

Today a provider has one shared `cost` object and one shared billing template attribution. A provider can also expose multiple `models`. That means requests routed to different target models under the same provider still inherit the same pricing, which is incorrect when the upstream models have different official prices.

This mismatch exists in all three layers:

- Config stores one provider-level `cost`
- Provider edit page edits one provider-level template and one set of price fields
- Runtime cost snapshot reads provider-level cost without considering the routed target model

## Recommended Approach

Use model-level billing as the primary data model.

Each provider will own a `modelCosts` map keyed by target model string. Each entry reuses the current `RuleCostConfig` shape so existing template attribution, currency, and price fields remain intact.

Provider-wide shared pricing should no longer be the source of truth for runtime cost calculation.

## Data Model

### New shape

Provider gains:

- `modelCosts: Record<string, RuleCostConfig>`

Key rules:

- The key must exactly match the provider's configured target model string
- A model may exist in `provider.models` without a `modelCosts` entry
- Missing `modelCosts[model]` means that model has no configured billing

### Existing `cost`

For migration and compatibility, existing persisted configs may still contain `provider.cost`.

After migration:

- Runtime billing must resolve from `modelCosts`
- New saves from the UI should write `modelCosts`
- `provider.cost` should no longer be treated as the active billing source for model-routed traffic

This keeps the runtime rule simple: routed model first, no provider-wide fallback for normal requests.

## Migration

### Recommended migration behavior

When loading an older config that has `provider.cost` but does not have `provider.modelCosts`:

- Copy the old `provider.cost` into every current entry in `provider.models`
- Create `modelCosts[model] = cloned provider.cost` for each model

This is the least surprising migration because it preserves prior behavior: all models continue to use the same price until the user edits them individually.

### Save behavior after migration

Once the provider is re-saved from the UI:

- Persist `modelCosts`
- Do not rely on `provider.cost` for future runtime billing

Whether `provider.cost` is fully removed from persisted output or retained temporarily for compatibility can be decided during implementation, but it must not be the runtime source of truth.

## Runtime Billing Resolution

### Source of truth

Each request cost snapshot must resolve pricing from the actual routed `targetModel`.

Resolution steps:

1. Determine the routed provider
2. Determine the routed `targetModel`
3. Look up `provider.modelCosts[targetModel]`
4. If a cost config exists and is enabled, compute the cost snapshot from that config
5. If no model-specific config exists, treat the request as having no billing configuration

### Non-goals

Do not resolve billing from:

- request alias such as `default`
- upstream response model text
- provider-wide shared cost fallback during normal request execution

The reason is consistency: routing already decided which target model this request uses, so billing must follow that exact routed model.

## Provider Edit UX

### Chosen interaction

Use a model selector with a single focused editor panel.

Layout:

- Keep the existing Cost section
- Keep a provider-level cost tracking enable switch
- When enabled, show a two-pane model billing editor:
  - Left pane: provider model list with per-model billing status
  - Right pane: template summary and price editor for the currently selected model

### Left pane behavior

For each model in `provider.models`, show:

- model name
- status summary:
  - `No billing template applied`
  - `Applied <vendor> / <model>`
  - `Applied <vendor> / <model>, modified after apply`

The selected model is visually active.

### Right pane behavior

The right pane edits only the selected model's billing config:

- template summary
- official source link if present
- clear template source action
- open billing template modal
- currency
- input price per 1M
- output price per 1M
- cache input price per 1M
- cache output price per 1M

Changing fields in the right pane affects only the selected model entry in `modelCosts`.

### Empty state

If billing is enabled but the provider has no models yet:

- show a message telling the user to add at least one model before configuring billing templates
- do not show a broken editor panel

### New model behavior

When a user adds a new model:

- create no billing template by default
- the new model starts empty

This avoids silently copying a price from another model and producing incorrect cost calculations.

### Delete model behavior

When a user deletes a model:

- remove that model from `provider.models`
- remove the matching `provider.modelCosts[model]`

This deletion must be automatic and part of the same edit flow so stale billing templates are not left behind for removed models.

If the deleted model was currently selected in the billing editor:

- move selection to the next available model, or the previous one if there is no next model
- if no models remain, show the empty state

## Billing Template Modal

The current modal can remain mostly unchanged.

The only behavior change is scope:

- applying a template applies it to the currently selected provider model only
- clearing template source clears the attribution for the currently selected model only
- manual edits mark only the selected model's attribution as modified

## Logs and Stats

### Request logs

Per-request `cost_snapshot` should continue to be written into log entries.

No log schema redesign is required if the runtime computes the correct per-request snapshot before persistence.

### Stats store

Stats aggregation already consumes request-level cost snapshots. That means the main requirement is correctness at write time.

If one provider uses multiple models with different prices:

- requests should aggregate naturally based on their own stored snapshot values

### Currency display

Provider-level aggregated views can no longer assume one provider has one currency.

UI rules:

- when all aggregated entries share one currency, display that currency normally
- when aggregated entries mix currencies, display a mixed-currency state instead of pretending there is one provider currency

This matches the current logs mixed-currency display direction and avoids misleading totals.

## Validation Rules

- `modelCosts` keys should correspond to configured provider models
- stray keys for removed models should be cleaned up by the editor on save
- missing `modelCosts` entries are allowed
- disabled model cost configs should produce no billed cost

## Testing Strategy

### Config and migration tests

- old config with provider-wide `cost` loads into per-model `modelCosts`
- each existing model receives a cloned cost config during migration
- migrated template attribution remains intact per model

### Form tests

- selecting different models shows different template summaries and price fields
- editing one model does not mutate another model's billing config
- applying a template affects only the selected model
- deleting a model removes its `modelCosts` entry

### Runtime tests

- one provider with two target models and two different price configs produces different request cost snapshots depending on routed target model
- request with missing model cost config produces no billed snapshot

### End-to-end coverage

- configure one provider with at least two target models
- assign different billing templates or manual prices to the two models
- send traffic to both routes
- verify logs and stats reflect different totals
- verify model filtering in logs still works with the new request cost data

## Risks and Mitigations

### Risk: mixed old/new schema handling becomes messy

Mitigation:

- keep migration logic centralized
- make runtime billing depend on one explicit resolver for model cost lookup

### Risk: model rename semantics are ambiguous

Mitigation:

- in the current UI, renaming is effectively remove old + add new
- treat it that way and do not attempt automatic carry-over unless explicitly designed later

### Risk: users expect new models to inherit an existing template

Mitigation:

- start new models blank for correctness
- do not introduce implicit inheritance in this change; any future duplication workflow must be an explicit user action

## Recommendation Summary

Implement model-specific billing templates keyed by provider target model, use the routed `targetModel` as the sole runtime billing selector, migrate old provider-wide cost into all existing models, and use a left-model-list plus right-detail-editor UX in the provider Cost section. Deleting a model must also delete its billing template and price config automatically.
