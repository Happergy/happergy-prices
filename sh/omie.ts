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
  removeFileIfExists,
  runCli,
  saveFile,
} from "./runtime";
dayjs.extend(utc);
dayjs.extend(timezone);

function getFilePath(date: dayjs.Dayjs): string {
  return `${DATA_DIR}/${date.format("YYYYMMDD")}-omie.json`;
}

export async function runOMIE(): Promise<boolean> {
  console.log("[OMIE] Checking OMIE prices");

  const now = dayjs().tz(TIME_ZONE);
  const targetFile = getFilePath(now.add(1, "day"));

  if (await fileExists(targetFile)) {
    console.log(`[OMIE] The file exists: ${targetFile}`);
    return false;
  }

  const data = await fetchText(`${API_BASE_URL}/getTomorrowPricesOMIE`, "OMIE");
  if (!data) {
    console.log("[OMIE] No data");
    return false;
  }

  const simulation = await fetchText(`${API_BASE_URL}/simulatePVPC`, "PVPC simulation");
  await Promise.all([saveFile(targetFile, data), saveFile(`${DATA_DIR}/pvpc.json`, simulation)]);
  const cleanupDate = now.subtract(8, "day");
  await removeFileIfExists(getFilePath(cleanupDate));
  console.log("💾 [PVPC simulation] New prices were saved");

  console.log(`💾 [OMIE] New prices were saved to ${targetFile}`);
  return true;
}

if (isMainModule(import.meta.url)) {
  await runCli("OMIE", async () => {
    await runOMIE();
  });
}
