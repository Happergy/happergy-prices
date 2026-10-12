import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  API_BASE_URL,
  DATA_DIR,
  TIME_ZONE,
  fileExists,
  fetchText,
  isMainModule,
  isRecord,
  removeFileIfExists,
  runCli,
  saveFile,
} from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

const CLEANUP_DAYS = 2;
const DATE_FORMAT = "YYYY-MM-DD";

export async function runEcoData(): Promise<void> {
  const now = dayjs().tz(TIME_ZONE);
  const targetFile = `${DATA_DIR}/${now.format("YYYYMMDD")}-ecoData.json`;
  const lastUpdatedFile = `${DATA_DIR}/ecoData.json`;

  if (await fileExists(targetFile)) {
    console.log(`[EcoData] The file exists: ${targetFile}`);
    return;
  }

  const data = await fetchText(`${API_BASE_URL}/getLastUpdatedEcoData`, "EcoData");
  if (!data) {
    console.log("[EcoData] No data");
    return;
  }

  const response: unknown = JSON.parse(data);
  let responseDate: string | undefined;
  if (isRecord(response)) {
    if (typeof response.date === "string") {
      responseDate = response.date;
    } else if (
      isRecord(response.Renovables) &&
      typeof response.Renovables.datetime === "string"
    ) {
      responseDate = response.Renovables.datetime;
    }
  }
  if (responseDate === undefined || !dayjs(responseDate).isValid()) {
    throw new Error("[EcoData] The API returned an invalid date");
  }

  const ecoDataDate = dayjs(responseDate).tz(TIME_ZONE).format("YYYYMMDD");
  const ecoDataDateFile = `${DATA_DIR}/${ecoDataDate}-ecoData.json`;
  if (await fileExists(ecoDataDateFile)) {
    console.log(`[EcoData] The file exists: ${ecoDataDateFile}`);
    return;
  }

  const cleanupDate = now.subtract(CLEANUP_DAYS, "day").format(DATE_FORMAT);
  const cleanupPath = `${DATA_DIR}/${cleanupDate.replaceAll("-", "")}-ecoData.json`;
  const filesToSave = new Set([targetFile, lastUpdatedFile, ecoDataDateFile]);
  await Promise.all([
    ...Array.from(filesToSave, (path) => saveFile(path, data)),
    removeFileIfExists(cleanupPath),
  ]);
  console.log("💾 [EcoData] Last ecoData updated");
}

if (isMainModule(import.meta.url)) {
  await runCli("EcoData", runEcoData);
}
