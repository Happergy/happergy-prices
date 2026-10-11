import { readFile } from "node:fs/promises";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { runEcoData } from "./ecoData";
import { runOMIE } from "./omie";
import { runPVPC } from "./pvpc";
import { runPrices } from "./prices";
import { DATA_DIR, TIME_ZONE, fileExists, isMainModule, isRecord, runCli } from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

function getFilePath(date: dayjs.Dayjs, source: string): string {
  return `${DATA_DIR}/${date.format("YYYYMMDD")}-${source}.json`;
}

async function getLatestPricesHour(): Promise<string | null> {
  const file = await readFile(`${DATA_DIR}/happergy.json`, "utf8");
  const data: unknown = JSON.parse(file);
  if (!isRecord(data) || !isRecord(data.pvpcToday)) return null;
  const currentPrice = data.pvpcToday.currentPrice;
  if (!isRecord(currentPrice) || typeof currentPrice.date !== "string") {
    return null;
  }
  const date = dayjs(currentPrice.date);
  return date.isValid() ? date.tz(TIME_ZONE).format("HH") : null;
}

export async function updatePrices(force = false): Promise<boolean> {
  if (force) {
    console.log("💡 We need to force update prices");
    await runPrices();
    return true;
  }

  const now = dayjs().tz(TIME_ZONE);
  const latestHour = await getLatestPricesHour();
  if (!latestHour || now.hour() !== Number(latestHour)) {
    console.log(
      `💡 We are at ${now.format("HH")}:00. We need to update prices${latestHour ? ` from ${latestHour}:00` : ""}`,
    );
    await runPrices();
    return true;
  }

  console.log(`✅ We are at ${now.format("HH")}:00. Prices are from ${latestHour}:00`);
  return false;
}

export async function runChecks(): Promise<void> {
  const now = dayjs().tz(TIME_ZONE);
  const tomorrow = now.add(1, "day");
  let updatedOMIE = false;
  let updatedPVPC = false;

  const omieFile = getFilePath(tomorrow, "omie");
  const omieExists = await fileExists(omieFile);
  if (!omieExists && now.hour() >= 13) {
    console.log("💡 We need to update OMIE prices");
    updatedOMIE = await runOMIE();
    if (updatedOMIE) await updatePrices(true);
  } else if (omieExists) {
    console.log("✅ OMIE prices are up to date");
  } else {
    console.log("⏲️ OMIE prices will be updated after 13:00");
  }

  const pvpcFile = getFilePath(tomorrow, "pvpc");
  const pvpcExists = await fileExists(pvpcFile);
  if (!pvpcExists && now.hour() >= 20) {
    console.log("💡 We need to update PVPC prices");
    await runPVPC();
    updatedPVPC = true;
  } else if (pvpcExists) {
    console.log("✅ PVPC prices are up to date");
  } else {
    console.log("⏲️ PVPC prices will be updated after 20:00");
  }

  const ecoDataFile = getFilePath(now, "ecoData");
  if (!(await fileExists(ecoDataFile))) {
    console.log("💡 We need to update ecoData prices");
    await runEcoData();
  }

  if (updatedOMIE || updatedPVPC) {
    console.log("💡 Prices will be updated after new prices file");
  } else {
    await updatePrices();
  }
}

if (isMainModule(import.meta.url)) {
  await runCli("Check", runChecks);
}
