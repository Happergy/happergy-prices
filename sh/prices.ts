import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { applyTomorrowPVPC, persistSimulatedPVPC, resolveTomorrowPVPC } from "./pvpcEstimate";
import {
  API_BASE_URL,
  DATA_DIR,
  fetchText,
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

export async function runPrices(): Promise<void> {
  const body = await fetchText(`${API_BASE_URL}/generic`, "Prices");
  const prices = parsePrices(body);
  const now = dayjs().tz(TIME_ZONE);
  const yesterday = now.subtract(1, "day").format("YYYY-MM-DD");
  const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
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
