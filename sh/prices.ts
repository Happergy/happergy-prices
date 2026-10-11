import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  API_BASE_URL,
  DATA_DIR,
  TIME_ZONE,
  fetchText,
  isMainModule,
  isRecord,
  runCli,
  saveFile,
} from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

interface GenericPrices {
  omie: unknown;
  pvpc: unknown;
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
    !("pvpcTomorrow" in value)
  ) {
    throw new Error("The prices API returned an invalid response");
  }
  return {
    omie: value.omie,
    pvpc: value.pvpc,
    pvpcToday: value.pvpcToday,
    pvpcTomorrow: value.pvpcTomorrow,
  };
}

export async function runPrices(): Promise<void> {
  const body = await fetchText(`${API_BASE_URL}/generic`, "Prices");
  const prices = parsePrices(body);
  const lastUpdated = dayjs().tz(TIME_ZONE).format("YYYY-MM-DD HH:mm:ss");
  const omiePrices = { omie: { prices: prices.omie, lastUpdated } };
  const pvpcPrices = {
    pvpc: { prices: prices.pvpc, lastUpdated },
    pvpcToday: prices.pvpcToday,
    pvpcTomorrow: prices.pvpcTomorrow,
  };

  await Promise.all([
    saveFile(`${DATA_DIR}/happergy-omie.json`, JSON.stringify(omiePrices)),
    saveFile(`${DATA_DIR}/happergy-pvpc.json`, JSON.stringify(pvpcPrices)),
    saveFile(`${DATA_DIR}/happergy.json`, body),
  ]);

  console.log(
    "🔥 The files happergy-omie.json, happergy-pvpc.json and happergy.json were updated!",
  );
}

if (isMainModule(import.meta.url)) {
  await runCli("Prices", runPrices);
}
