import { readFile } from "node:fs/promises";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import {
  applyTodayPVPC,
  applyTomorrowPVPC,
  persistSimulatedPVPC,
  resolveTomorrowPVPC,
} from "./pvpcEstimate";
import {
  API_BASE_URL,
  DATA_DIR,
  fetchText,
  fileExists,
  isMainModule,
  isRecord,
  runCli,
  saveFile,
  TIME_ZONE,
} from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

interface GenericPrices extends Record<string, unknown> {
  omie: unknown;
  pvpc: Record<string, unknown>;
  pvpcToday: unknown;
  pvpcTomorrow: unknown;
}

type PricesFetcher = (url: string, context: string) => Promise<string>;
type Waiter = (milliseconds: number) => Promise<void>;

const GENERIC_PRICES_ATTEMPTS = 3;
const GENERIC_PRICES_RETRY_DELAY_MS = 2_000;

function parsePrices(body: string): GenericPrices {
  const value: unknown = JSON.parse(body);
  if (
    !isRecord(value) ||
    !("omie" in value) ||
    !("pvpc" in value) ||
    !("pvpcToday" in value) ||
    !("pvpcTomorrow" in value) ||
    !isRecord(value.pvpc)
  ) {
    throw new Error("The prices API returned an invalid response");
  }
  return {
    ...value,
    omie: value.omie,
    pvpc: value.pvpc,
    pvpcToday: value.pvpcToday,
    pvpcTomorrow: value.pvpcTomorrow,
  };
}

function hasCompletePVPC(prices: GenericPrices): boolean {
  return Array.isArray(prices.pvpc.devices) && isRecord(prices.pvpc.summary);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchGenericPrices(
  fetcher: PricesFetcher = fetchText,
  waiter: Waiter = wait,
  attempts = GENERIC_PRICES_ATTEMPTS,
): Promise<GenericPrices> {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Prices attempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const body = await fetcher(`${API_BASE_URL}/generic`, "Prices");
    const prices = parsePrices(body);
    if (hasCompletePVPC(prices)) return prices;

    if (attempt < attempts) {
      console.warn(
        `[Prices] Incomplete PVPC response (attempt ${attempt}/${attempts}); retrying in ${GENERIC_PRICES_RETRY_DELAY_MS} ms`,
      );
      await waiter(GENERIC_PRICES_RETRY_DELAY_MS);
    }
  }

  throw new Error(`Prices API returned PVPC without devices or summary after ${attempts} attempts`);
}

export async function runPrices(): Promise<void> {
  const prices = await fetchGenericPrices();
  const now = dayjs().tz(TIME_ZONE);
  const today = now.format("YYYY-MM-DD");
  const yesterday = now.subtract(1, "day").format("YYYY-MM-DD");
  const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
  const todayPath = `${DATA_DIR}/${today.replaceAll("-", "")}-pvpc.json`;
  if (await fileExists(todayPath)) {
    const todayPrices: unknown = JSON.parse(await readFile(todayPath, "utf8"));
    applyTodayPVPC(prices, todayPrices, today, now);
  }
  const forecast = await resolveTomorrowPVPC(prices.pvpc.nextPrices, yesterday, tomorrow);
  applyTomorrowPVPC(prices, forecast, tomorrow);
  const lastUpdated = now.format("YYYY-MM-DD HH:mm:ss");
  const omiePrices = { omie: { prices: prices.omie, lastUpdated } };
  const pvpcPrices = {
    pvpc: { prices: prices.pvpc, lastUpdated },
    pvpcToday: prices.pvpcToday,
    pvpcTomorrow: prices.pvpcTomorrow,
  };

  await Promise.all([
    saveFile(`${DATA_DIR}/happergy-omie.json`, JSON.stringify(omiePrices)),
    saveFile(`${DATA_DIR}/happergy-pvpc.json`, JSON.stringify(pvpcPrices)),
    saveFile(`${DATA_DIR}/happergy.json`, JSON.stringify(prices)),
    persistSimulatedPVPC(forecast, tomorrow),
  ]);

  console.log(
    "🔥 The files happergy-omie.json, happergy-pvpc.json and happergy.json were updated!",
  );
}

if (isMainModule(import.meta.url)) {
  await runCli("Prices", runPrices);
}
