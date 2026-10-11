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
| `bun run typecheck` | Run the TypeScript compiler without emitting files. |

To fetch PVPC data for a specific date, use `YYYYMMDD` or `YYYY-MM-DD`:

```sh
bun run sh/pvpc.ts 20261012
bun run sh/pvpc.ts 2026-10-12
```

Without a date, the PVPC script targets tomorrow in the `Europe/Madrid`
timezone. If the PVPC API returns `404` because prices have not been published
yet, the script reports that and exits without treating it as an error. Other
request or processing failures are reported and return a non-zero exit status.

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
