import { readFile } from "node:fs/promises";
import { join } from "node:path";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { DATA_DIR, fileExists, isRecord, removeFileIfExists, saveFile, TIME_ZONE } from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

const HOUR_MS = 60 * 60 * 1000;
const OMIE_WEIGHT = 0.45;

export interface PricePoint {
  date: string;
  price: number;
  simulated?: boolean;
  [key: string]: unknown;
}

export interface TomorrowPVPCResult {
  kind: "official" | "estimated" | "unavailable";
  prices: PricePoint[];
  reason?: string;
}

export function simulatedPVPCFilePath(date: string, dataDir = DATA_DIR): string {
  return join(dataDir, `${date.replaceAll("-", "")}-pvpc-simulated.json`);
}

export async function persistSimulatedPVPC(
  result: TomorrowPVPCResult,
  date: string,
  dataDir = DATA_DIR,
): Promise<void> {
  const path = simulatedPVPCFilePath(date, dataDir);
  if (result.kind === "estimated") {
    await saveFile(path, JSON.stringify(result.prices));
    return;
  }
  await removeFileIfExists(path);
}

interface ValidatedPoint extends PricePoint {
  timestamp: number;
  localHour: string;
  occurrence: number;
}

function parsePoint(value: unknown, source: string): PricePoint {
  if (
    !isRecord(value) ||
    typeof value.date !== "string" ||
    typeof value.price !== "number" ||
    !Number.isFinite(value.price) ||
    ("simulated" in value && typeof value.simulated !== "boolean")
  ) {
    throw new Error(`[PVPC estimate] Invalid ${source} price point`);
  }
  const { date, price, simulated, ...metadata } = value;
  return {
    ...metadata,
    date,
    price,
    ...(typeof simulated === "boolean" ? { simulated } : {}),
  };
}

function localDate(value: string, source: string): dayjs.Dayjs {
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error(`[PVPC estimate] Date in ${source} must include a timezone offset: ${value}`);
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    throw new Error(`[PVPC estimate] Invalid date in ${source}: ${value}`);
  }
  return parsed.tz(TIME_ZONE);
}

function expectedLocalHours(date: string): string[] {
  const start = dayjs.tz(date, TIME_ZONE);
  if (!start.isValid() || start.format("YYYY-MM-DD") !== date) {
    throw new Error(`[PVPC estimate] Invalid expected date: ${date}`);
  }
  const end = dayjs.tz(start.add(1, "day").format("YYYY-MM-DD"), TIME_ZONE);
  const hours: string[] = [];
  for (let timestamp = start.valueOf(); timestamp < end.valueOf(); timestamp += HOUR_MS) {
    hours.push(dayjs(timestamp).tz(TIME_ZONE).format("YYYY-MM-DDTHH"));
  }
  return hours;
}

function validateDay(
  values: unknown,
  date: string,
  source: string,
  requireOfficial = false,
): ValidatedPoint[] {
  const expectedHours = expectedLocalHours(date);
  if (!Array.isArray(values)) {
    throw new Error(`[PVPC estimate] Missing or invalid ${source} data for ${date}`);
  }
  if (values.length !== expectedHours.length) {
    throw new Error(
      `[PVPC estimate] Incomplete ${source} data for ${date}: received ${values.length} prices; expected ${expectedHours.length}`,
    );
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const occurrenceCounts = new Map<string, number>();
  return values.map((value, index) => {
    const point = parsePoint(value, source);
    if (requireOfficial && point.simulated === true) {
      throw new Error(`[PVPC estimate] ${source} data for ${date} is simulated, not official`);
    }
    const timestamp = localDate(point.date, source);
    if (timestamp.format("YYYY-MM-DD") !== date) {
      throw new Error(
        `[PVPC estimate] ${source} price ${point.date} is not for ${date} in ${TIME_ZONE}`,
      );
    }
    if (timestamp.minute() !== 0 || timestamp.second() !== 0) {
      throw new Error(`[PVPC estimate] ${source} price ${point.date} is not aligned to an hour`);
    }
    if (timestamp.valueOf() <= previousTimestamp) {
      throw new Error(`[PVPC estimate] ${source} hours for ${date} are unordered or ambiguous`);
    }
    previousTimestamp = timestamp.valueOf();

    const localHour = timestamp.format("YYYY-MM-DDTHH");
    const occurrence = occurrenceCounts.get(localHour) ?? 0;
    occurrenceCounts.set(localHour, occurrence + 1);
    if (expectedHours[index] !== localHour) {
      throw new Error(
        `[PVPC estimate] ${source} hours for ${date} cannot be aligned: expected ${expectedHours[index]}, received ${localHour}`,
      );
    }
    return { ...point, timestamp: timestamp.valueOf(), localHour, occurrence };
  });
}

export function estimatePVPCTomorrow(
  pvpcYesterday: unknown,
  omieYesterday: unknown,
  omieTomorrow: unknown,
  yesterday: string,
  tomorrow: string,
): PricePoint[] {
  const pvpcReference = validateDay(pvpcYesterday, yesterday, "official PVPC yesterday", true);
  const omieReference = validateDay(omieYesterday, yesterday, "OMIE yesterday");
  const omieForecast = validateDay(omieTomorrow, tomorrow, "OMIE tomorrow");

  if (pvpcReference.length !== omieReference.length) {
    throw new Error("[PVPC estimate] Yesterday's PVPC and OMIE hours cannot be aligned");
  }

  const referenceByHour = new Map<string, { pvpc: ValidatedPoint; omie: ValidatedPoint }>();
  pvpcReference.forEach((point, index) => {
    const key = `${point.localHour.slice(-2)}#${point.occurrence}`;
    referenceByHour.set(key, { pvpc: point, omie: omieReference[index] });
  });

  return omieForecast.map((omiePoint) => {
    const key = `${omiePoint.localHour.slice(-2)}#${omiePoint.occurrence}`;
    const reference = referenceByHour.get(key);
    if (!reference) {
      throw new Error(
        `[PVPC estimate] Cannot unambiguously align ${omiePoint.localHour} occurrence ${omiePoint.occurrence + 1} with yesterday`,
      );
    }
    return {
      date: dayjs(omiePoint.timestamp).tz(TIME_ZONE).format("YYYY-MM-DDTHH:mm:ssZ"),
      price: Math.round(
        reference.pvpc.price + OMIE_WEIGHT * (omiePoint.price - reference.omie.price),
      ),
      simulated: true,
    };
  });
}

function pointsForLocalDate(values: unknown, date: string, source: string): PricePoint[] {
  if (values === undefined || values === null) {
    return [];
  }
  if (!Array.isArray(values)) {
    throw new Error(`[PVPC estimate] Invalid ${source} prices`);
  }
  return values
    .map((value) => parsePoint(value, source))
    .filter((point) => localDate(point.date, source).format("YYYY-MM-DD") === date);
}

export function completeOfficialTomorrow(values: unknown, date: string): PricePoint[] | null {
  const points = pointsForLocalDate(values, date, "PVPC");
  const official = points.filter((point) => point.simulated !== true);
  if (official.length === 0) return null;
  if (official.length !== expectedLocalHours(date).length) return null;
  return validateDay(official, date, "official PVPC tomorrow", true).map(
    ({ timestamp: _timestamp, localHour: _localHour, occurrence: _occurrence, ...point }) => point,
  );
}

async function readDailyPrices(date: string, source: "pvpc" | "omie"): Promise<unknown | null> {
  const path = `${DATA_DIR}/${date.replaceAll("-", "")}-${source}.json`;
  if (!(await fileExists(path))) return null;
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function summarize(
  prices: PricePoint[],
  averagePrices: PricePoint[] = prices,
): Record<string, unknown> {
  const best = prices.reduce((current, point) => (point.price < current.price ? point : current));
  const worst = prices.reduce((current, point) => (point.price > current.price ? point : current));
  const summarizePoint = ({ date, price, simulated }: PricePoint) => ({
    date,
    price,
    simulated,
  });
  return {
    avgPrice: Math.round(
      averagePrices.reduce((sum, point) => sum + point.price, 0) / averagePrices.length,
    ),
    bestPrice: summarizePoint(best),
    currentPrice: summarizePoint(prices[0]),
    worstPrice: summarizePoint(worst),
  };
}

export function applyTodayPVPC(
  payload: Record<string, unknown>,
  values: unknown,
  today: string,
  now: dayjs.Dayjs,
): void {
  const official = validateDay(values, today, "official PVPC today", true).map(
    ({ timestamp: _timestamp, localHour: _localHour, occurrence: _occurrence, ...point }) => point,
  );
  const currentHour = now.tz(TIME_ZONE).startOf("hour").valueOf();
  const remainingToday = official.filter(
    (point) => localDate(point.date, "PVPC").valueOf() >= currentHour,
  );
  if (remainingToday.length === 0) {
    throw new Error(`[PVPC estimate] No current or future PVPC prices for ${today}`);
  }

  const pvpc = isRecord(payload.pvpc) ? payload.pvpc : {};
  const apiPrices = pvpc.nextPrices;
  if (apiPrices !== undefined && apiPrices !== null && !Array.isArray(apiPrices)) {
    throw new Error("[PVPC estimate] Prices API returned invalid PVPC nextPrices");
  }
  const otherDays = (apiPrices ?? []).filter((value) => {
    const point = parsePoint(value, "PVPC");
    return localDate(point.date, "PVPC").format("YYYY-MM-DD") !== today;
  });

  payload.pvpc = { ...pvpc, nextPrices: [...remainingToday, ...otherDays] };
  payload.pvpcToday = summarize(remainingToday, official);
}

export async function resolveTomorrowPVPC(
  apiPrices: unknown,
  yesterday: string,
  tomorrow: string,
): Promise<TomorrowPVPCResult> {
  const localOfficial = await readDailyPrices(tomorrow, "pvpc");
  if (localOfficial !== null) {
    const official = validateDay(localOfficial, tomorrow, "official PVPC tomorrow", true);
    return {
      kind: "official",
      prices: official.map(
        ({ timestamp: _timestamp, localHour: _localHour, occurrence: _occurrence, ...point }) =>
          point,
      ),
    };
  }

  const apiOfficial = completeOfficialTomorrow(apiPrices, tomorrow);
  if (apiOfficial) return { kind: "official", prices: apiOfficial };

  const [pvpcYesterday, omieYesterday, omieTomorrow] = await Promise.all([
    readDailyPrices(yesterday, "pvpc"),
    readDailyPrices(yesterday, "omie"),
    readDailyPrices(tomorrow, "omie"),
  ]);
  const missing = [
    pvpcYesterday === null ? `PVPC yesterday (${yesterday})` : null,
    omieYesterday === null ? `OMIE yesterday (${yesterday})` : null,
    omieTomorrow === null ? `OMIE tomorrow (${tomorrow})` : null,
  ].filter((item): item is string => item !== null);
  if (missing.length > 0) {
    return {
      kind: "unavailable",
      prices: [],
      reason: `missing ${missing.join(", ")}`,
    };
  }
  return {
    kind: "estimated",
    prices: estimatePVPCTomorrow(pvpcYesterday, omieYesterday, omieTomorrow, yesterday, tomorrow),
  };
}

export function applyTomorrowPVPC(
  payload: Record<string, unknown>,
  result: TomorrowPVPCResult,
  tomorrow: string,
): void {
  if (!isRecord(payload.pvpc)) {
    throw new Error("[PVPC estimate] Prices API returned invalid PVPC nextPrices");
  }
  const pvpc = payload.pvpc;
  const apiPrices = pvpc.nextPrices;
  if (apiPrices !== undefined && apiPrices !== null && !Array.isArray(apiPrices)) {
    throw new Error("[PVPC estimate] Prices API returned invalid PVPC nextPrices");
  }
  const remainingPrices = (apiPrices ?? []).filter((value) => {
    const point = parsePoint(value, "PVPC");
    return localDate(point.date, "PVPC").format("YYYY-MM-DD") !== tomorrow;
  });
  const nextPrices = [...remainingPrices, ...result.prices];
  payload.pvpc = { ...pvpc, nextPrices };

  if (result.kind === "unavailable") {
    payload.pvpcTomorrow = {};
    console.log(`[PVPC estimate] Tomorrow's prices unavailable: ${result.reason}`);
  } else if (result.kind === "estimated") {
    payload.pvpcTomorrow = summarize(result.prices);
    console.log("[PVPC estimate] Tomorrow's PVPC prices are simulated");
  } else {
    payload.pvpcTomorrow = summarize(result.prices);
    console.log("[PVPC estimate] Complete official PVPC prices take precedence");
  }
}
