import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import {
  DATA_DIR,
  fileExists,
  isMainModule,
  removeFileIfExists,
  runCli,
  saveFile,
  TIME_ZONE,
} from "./runtime";

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export interface OMIEPrice {
  date: string;
  price: number;
}

interface OMIEPeriod {
  period: number;
  price: number;
}

const OMIE_FILE_URL = "https://www.omie.es/es/file-download";
const APP_PRICE_SCALE = 100;
const HOUR_MS = 60 * 60 * 1000;

function getTargetDate(input: string | undefined): dayjs.Dayjs {
  if (!input) {
    return dayjs.tz(dayjs().tz(TIME_ZONE).add(1, "day").format("YYYY-MM-DD"), TIME_ZONE);
  }

  let parsed: dayjs.Dayjs;
  if (/^\d{8}$/.test(input)) {
    parsed = dayjs(input, "YYYYMMDD", true);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    parsed = dayjs(input, "YYYY-MM-DD", true);
  } else {
    throw new Error("Invalid date format. Use YYYYMMDD or YYYY-MM-DD.");
  }

  if (!parsed.isValid()) {
    throw new Error("Invalid date. Use a valid date in YYYYMMDD or YYYY-MM-DD format.");
  }
  return dayjs.tz(parsed.format("YYYY-MM-DD"), TIME_ZONE);
}

export function buildOMIEUrl(date: dayjs.Dayjs): string {
  const url = new URL(OMIE_FILE_URL);
  url.searchParams.set("parents", "marginalpdbc");
  url.searchParams.set("filename", `marginalpdbc_${date.format("YYYYMMDD")}.1`);
  return url.toString();
}

function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ";" && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("Unterminated quoted CSV field");
  }
  fields.push(field.trim());
  while (fields.at(-1) === "") fields.pop();
  return fields;
}

function isIgnorableRow(fields: string[]): boolean {
  const firstField = fields[0]?.toLowerCase() ?? "";
  if (
    !firstField ||
    firstField === "*" ||
    firstField.startsWith("#") ||
    firstField === "marginalpdbc"
  ) {
    return true;
  }

  return ["year", "año", "date", "fecha"].includes(firstField);
}

function parsePositiveInteger(value: string, label: string, rowNumber: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label} on OMIE CSV row ${rowNumber}: "${value}"`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${label} on OMIE CSV row ${rowNumber}: "${value}"`);
  }
  return parsed;
}

function parsePrice(value: string, rowNumber: number): number {
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(value)) {
    throw new Error(`Invalid Spanish OMIE price on CSV row ${rowNumber}: "${value}"`);
  }
  const price = Number(value.replace(",", "."));
  if (!Number.isFinite(price)) {
    throw new Error(`Invalid Spanish OMIE price on CSV row ${rowNumber}: "${value}"`);
  }
  return price;
}

function getExpectedHours(date: dayjs.Dayjs): number {
  const startOfDay = dayjs.tz(date.format("YYYY-MM-DD"), TIME_ZONE);
  const startOfNextDay = dayjs.tz(date.add(1, "day").format("YYYY-MM-DD"), TIME_ZONE);
  return (startOfNextDay.valueOf() - startOfDay.valueOf()) / HOUR_MS;
}

export function parseOMIECsv(csv: string, date: dayjs.Dayjs): OMIEPrice[] {
  const expectedDate = date.format("YYYY-MM-DD");
  const periods: OMIEPeriod[] = [];

  for (const [index, line] of csv.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const fields = parseCSVRow(line);
    if (isIgnorableRow(fields)) continue;
    if (fields.length < 5) {
      throw new Error(`Invalid OMIE CSV format on row ${index + 1}: expected at least 5 fields`);
    }

    const year = parsePositiveInteger(fields[0], "year", index + 1);
    const month = parsePositiveInteger(fields[1], "month", index + 1);
    const day = parsePositiveInteger(fields[2], "day", index + 1);
    const rowDate = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    if (rowDate !== expectedDate) {
      throw new Error(`OMIE CSV row ${index + 1} is for ${rowDate}, expected ${expectedDate}`);
    }

    periods.push({
      period: parsePositiveInteger(fields[3], "period", index + 1),
      price: parsePrice(fields[4], index + 1),
    });
  }

  if (periods.length === 0) {
    throw new Error(`OMIE CSV contains no price rows for ${expectedDate}`);
  }

  const expectedHours = getExpectedHours(date);
  const isQuarterHourly = periods.length === expectedHours * 4;
  const expectedPeriods = isQuarterHourly ? expectedHours * 4 : expectedHours;
  if (periods.length !== expectedPeriods) {
    throw new Error(
      `Incomplete OMIE data for ${expectedDate}: received ${periods.length} periods; expected ${expectedHours} hourly or ${expectedHours * 4} quarter-hourly periods`,
    );
  }

  for (const [index, period] of periods.entries()) {
    if (period.period !== index + 1) {
      throw new Error(
        `Incomplete or unordered OMIE periods for ${expectedDate}: expected period ${index + 1}, received ${period.period}`,
      );
    }
  }

  const dayStart = dayjs.tz(expectedDate, TIME_ZONE);
  if (isQuarterHourly) {
    return Array.from({ length: expectedHours }, (_, hourIndex) => {
      const hourPeriods = periods.slice(hourIndex * 4, hourIndex * 4 + 4);
      const average = hourPeriods.reduce((sum, period) => sum + period.price, 0) / 4;
      const timestamp = dayjs(dayStart.valueOf() + hourIndex * HOUR_MS).tz(TIME_ZONE);
      return {
        date: timestamp.format("YYYY-MM-DDTHH:mm:ssZ"),
        price: Math.round(average * APP_PRICE_SCALE),
      };
    });
  }

  return periods.map((period, index) => {
    const timestamp = dayjs(dayStart.valueOf() + index * HOUR_MS).tz(TIME_ZONE);
    return {
      date: timestamp.format("YYYY-MM-DDTHH:mm:ssZ"),
      price: Math.round(period.price * APP_PRICE_SCALE),
    };
  });
}

export async function getOMIEPrices(
  date: dayjs.Dayjs,
  fetcher: typeof fetch = fetch,
): Promise<OMIEPrice[] | null> {
  const response = await fetcher(buildOMIEUrl(date));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`OMIE: HTTP ${response.status} ${response.statusText}`);
  }
  return parseOMIECsv(await response.text(), date);
}

export async function runOMIE(
  inputDate?: string,
  fetcher: typeof fetch = fetch,
  dataDir = DATA_DIR,
): Promise<boolean> {
  console.log("[OMIE] Checking OMIE prices");

  const targetDate = inputDate
    ? getTargetDate(inputDate)
    : getTargetDate(dayjs().tz(TIME_ZONE).add(1, "day").format("YYYY-MM-DD"));
  const datePrefix = targetDate.format("YYYYMMDD");
  const targetFile = `${dataDir}/${datePrefix}-omie.json`;

  if (await fileExists(targetFile)) {
    console.log(`[OMIE] The file exists: ${targetFile}`);
    return false;
  }

  const simulatedPVPCFile = `${dataDir}/${datePrefix}-pvpc-simulated.json`;
  if (await fileExists(simulatedPVPCFile)) {
    console.log(
      `[OMIE] The simulated PVPC file exists: ${simulatedPVPCFile}; skipping OMIE request`,
    );
    return false;
  }

  const prices = await getOMIEPrices(targetDate, fetcher);
  if (!prices) {
    console.log(`[OMIE] Prices for ${targetDate.format("YYYY-MM-DD")} are not published yet`);
    return false;
  }

  await saveFile(targetFile, JSON.stringify(prices));
  await removeFileIfExists(
    `${dataDir}/${targetDate.subtract(9, "day").format("YYYYMMDD")}-omie.json`,
  );
  console.log(`💾 [OMIE] New prices were saved to ${targetFile}`);
  return true;
}

if (isMainModule(import.meta.url)) {
  await runCli("OMIE", async () => {
    await runOMIE(process.argv[2]);
  });
}
