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

interface DevicePrice {
  date: string;
  price: number;
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

function deviceCost(prices: DevicePrice[]): string {
  return (prices.reduce((sum, point) => sum + point.price, 0) / 100_000).toPrecision(2);
}

function deviceTime(value: dayjs.ConfigType): string {
  return dayjs(value).utc().format("YYYY-MM-DDTHH:mm:ssZ");
}

function createGenericDevices(values: unknown, today: string): Record<string, unknown>[] {
  const points = Array.isArray(values)
    ? values.flatMap((value): DevicePrice[] => {
        if (
          !isRecord(value) ||
          typeof value.date !== "string" ||
          typeof value.price !== "number" ||
          value.simulated === true ||
          dayjs(value.date).tz(TIME_ZONE).format("YYYY-MM-DD") !== today
        ) {
          return [];
        }
        return [{ date: value.date, price: value.price }];
      })
    : [];

  return Array.from({ length: 8 }, (_, index) => {
    const duration = index + 1;
    if (points.length < duration) {
      const start = dayjs();
      return {
        id: `generic${duration}`,
        duration: String(duration),
        consumptionKWh: "1",
        isOutOfRange: true,
        startTime: deviceTime(start),
        endTime: deviceTime(start.add(duration, "hour")),
        currentCost: "0.0",
        cheapestCost: "0.0",
        costSavings: 0,
      };
    }

    const currentCost = deviceCost(points.slice(0, duration));
    let cheapestIndex = 0;
    let cheapestCost = currentCost;
    for (let start = 1; start <= points.length - duration; start += 1) {
      const cost = deviceCost(points.slice(start, start + duration));
      if (Number(cost) < Number(cheapestCost)) {
        cheapestIndex = start;
        cheapestCost = cost;
      }
    }
    const start = points[cheapestIndex];
    return {
      id: `generic${duration}`,
      duration: String(duration),
      consumptionKWh: "1",
      isOutOfRange: false,
      startTime: deviceTime(start.date),
      endTime: deviceTime(dayjs(start.date).add(duration, "hour")),
      currentCost,
      cheapestCost,
      costSavings: Number(currentCost) - Number(cheapestCost),
    };
  });
}

function withoutSimulation(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { simulated: _simulated, ...point } = value;
  return point;
}

export function completeMissingPVPCMetadata(prices: GenericPrices, today: string): void {
  if (!Array.isArray(prices.pvpc.devices)) {
    prices.pvpc.devices = createGenericDevices(prices.pvpc.nextPrices, today);
  }
  if (!isRecord(prices.pvpc.summary) && isRecord(prices.pvpcToday)) {
    prices.pvpc.summary = {
      avgPrice: prices.pvpcToday.avgPrice,
      bestPrice: withoutSimulation(prices.pvpcToday.bestPrice),
      currentPrice: withoutSimulation(prices.pvpcToday.currentPrice),
      worstPrice: withoutSimulation(prices.pvpcToday.worstPrice),
    };
  }
}

export async function runPrices(): Promise<void> {
  const body = await fetchText(`${API_BASE_URL}/generic`, "Prices");
  const prices = parsePrices(body);
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
  completeMissingPVPCMetadata(prices, today);
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
