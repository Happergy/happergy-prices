# Happergy Prices

Scripts and GitHub Actions workflows for fetching and refreshing electricity
price data. The scripts are written in TypeScript and run with Bun.

## Requirements

- Node.js 24
- Bun 1.2.5

Install the dependencies from the repository root:

```sh
bun install --frozen-lockfile
```

Check the TypeScript scripts:

```sh
bun run typecheck
```

Format the repository with Biome, or check formatting without writing files:

```sh
bun run format
bun run format:check
```

## Available scripts

Run scripts from the repository root with `bun run <script>`.

| Command | Description |
| --- | --- |
| `bun run build` | Check the current data and fetch missing OMIE, PVPC, or EcoData files when their update time has arrived. Refresh the combined price files when needed. |
| `bun run build:pro` | Run the checker, fetch PVPC data, then fetch OMIE data. |
| `bun run prices` | Fetch the aggregated prices and write `data/happergy.json`, `data/happergy-omie.json`, and `data/happergy-pvpc.json`. |
| `bun run pvpc` | Fetch tomorrow's PVPC data, then refresh the aggregated price files. |
| `bun run omie` | Fetch tomorrow's OMIE data, then refresh the aggregated price files. |
| `bun run ecoData` | Fetch the latest EcoData and update its dated file and `data/ecoData.json`. |
| `bun run force` | Force-refresh the aggregated price files, regardless of their current hour. |
| `bun run test` | Run the focused Bun test suite. |
| `bun run typecheck` | Run the TypeScript compiler without emitting files. |

To fetch PVPC data for a specific date, use `YYYYMMDD` or `YYYY-MM-DD`:

```sh
bun run sh/pvpc.ts 20261012
bun run sh/pvpc.ts 2026-10-12
```

OMIE prices are downloaded directly from OMIE's official day-ahead market file
and saved as a validated JSON array in `data/YYYYMMDD-omie.json`. Run
`bun run sh/omie.ts YYYYMMDD` (or `YYYY-MM-DD`) for a specific day; without a
date, the script targets tomorrow in `Europe/Madrid`. OMIE reports wholesale
prices in €/MWh; the saved `price` values use the application's existing
€/MWh-times-100 integer scale. A 404 is reported as prices not yet published,
while HTTP, malformed, mismatched-date, or incomplete-day responses fail
explicitly. The parser supports hourly and quarter-hourly files and preserves
the 23/25-hour daylight-saving days, including both autumn occurrences of the
same local hour. OMIE prices are wholesale market prices, not PVPC prices.
If `data/YYYYMMDD-pvpc-simulated.json` already exists for the requested day,
the OMIE script skips the network request for that date.

Without a date, the PVPC script targets tomorrow in the `Europe/Madrid`
timezone. If the PVPC API returns `404` because prices have not been published
yet, the script reports that and exits without treating it as an error. Other
request or processing failures are reported and return a non-zero exit status.

When refreshing aggregate prices, if a complete official PVPC day for tomorrow
is unavailable, an estimate is published only when yesterday's complete
official PVPC series and complete OMIE series for both days are available. For
each local hour, it uses yesterday's PVPC plus 45% of the change between
tomorrow's and yesterday's OMIE prices. Both sources use the same
€/MWh-times-100 integer scale, so no unit conversion is applied. Estimated
points carry `simulated: true`; downstream charts can distinguish them (for
example, by rendering them in gray), and are saved separately as
`data/YYYYMMDD-pvpc-simulated.json`, using the forecast day's date. A complete
official PVPC day takes precedence and removes any previous simulated file for
that day. The estimate is approximate and does not reproduce the full official
PVPC methodology.

All series are checked and aligned by local hour in `Europe/Madrid`, including
daylight-saving transitions. Repeated autumn hours are paired by order of
occurrence; if a reference hour cannot be paired unambiguously, no estimate is
produced. Missing data or incomplete series do not result in partial or stale
simulated prices being displayed as a full-day forecast.

## GitHub Actions workflows

All workflows use Node.js 24 and Bun 1.2.5, install dependencies with the
committed `bun.lock`, run the TypeScript check, and commit generated changes
where noted below.

| Workflow file | Trigger | What it does |
| --- | --- | --- |
| [nextPrices.yml](.github/workflows/nextPrices.yml) | Hourly at minute 0 (UTC), or manually via **Run workflow**. | Runs `bun run build` to check and refresh price data, then commits changes. |
| [force.yml](.github/workflows/force.yml) | Manually via **Run workflow**. | Accepts an optional date for PVPC data, fetches PVPC, refreshes aggregated prices, and commits changes. |
| [getPVPC.yml](.github/workflows/getPVPC.yml) | Manually via **Run workflow**. | Accepts an optional date, fetches PVPC data, refreshes aggregated prices, and commits changes. Its scheduled trigger is currently commented out. |
| [getOMIE.yml](.github/workflows/getOMIE.yml) | Manually via **Run workflow**. | Runs `bun run omie` to fetch OMIE data and refresh aggregated prices, then commits changes. Its scheduled trigger is currently commented out. |
| [getEcoData.yml](.github/workflows/getEcoData.yml) | Manually via **Run workflow**. | Currently runs `bun run pvpc` (PVPC fetch and price refresh), then commits changes. The EcoData schedule is commented out. |

The `force.yml`, `getPVPC.yml`, `getOMIE.yml`, and `getEcoData.yml` workflows
are manual-only unless their commented schedule is explicitly enabled.
