import dayjs from "dayjs";
import {
  API_BASE_URL,
  DATA_DIR,
  fileExists,
  fetchText,
  isMainModule,
  isRecord,
  removeFileIfExists,
  runCli,
  saveFile,
} from "./runtime";

const CLEANUP_DAYS = 2;
const DATE_FORMAT = "YYYY-MM-DD";

export async function runEcoData(): Promise<void> {
  const now = dayjs();
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
  if (!isRecord(response) || typeof response.date !== "string" || !dayjs(response.date).isValid()) {
    throw new Error("[EcoData] The API returned an invalid date");
  }

  const ecoDataDateFile = `${DATA_DIR}/${dayjs(response.date).format("YYYYMMDD")}-ecoData.json`;
  if (await fileExists(ecoDataDateFile)) {
    console.log(`[EcoData] The file exists: ${ecoDataDateFile}`);
    return;
  }

  const cleanupDate = now.subtract(CLEANUP_DAYS, "day").format(DATE_FORMAT);
  const cleanupPath = `${DATA_DIR}/${cleanupDate.replaceAll("-", "")}-ecoData.json`;
  await Promise.all([
    saveFile(targetFile, data),
    saveFile(lastUpdatedFile, data),
    removeFileIfExists(cleanupPath),
  ]);
  console.log("💾 [EcoData] Last ecoData updated");
}

if (isMainModule(import.meta.url)) {
  await runCli("EcoData", runEcoData);
}
