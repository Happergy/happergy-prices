import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  API_BASE_URL,
  DATA_DIR,
  TIME_ZONE,
  fileExists,
  fetchTextIfAvailable,
  isMainModule,
  removeFileIfExists,
  runCli,
  saveFile,
} from "./runtime";

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

function getTargetDate(input: string | undefined) {
  if (!input) return dayjs().tz(TIME_ZONE).add(1, "day");

  let date;
  if (/^\d{8}$/.test(input)) {
    date = dayjs(input, "YYYYMMDD", true);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    date = dayjs(input, "YYYY-MM-DD", true);
  } else {
    throw new Error("Invalid date format. Use YYYYMMDD or YYYY-MM-DD.");
  }

  if (!date.isValid()) {
    throw new Error("Invalid date. Use a valid date in YYYYMMDD or YYYY-MM-DD format.");
  }
  return date.tz(TIME_ZONE, true);
}

export async function runPVPC(inputDate?: string): Promise<void> {
  const targetDate = getTargetDate(inputDate);
  const targetDateString = targetDate.format("YYYYMMDD");
  const targetFile = `${DATA_DIR}/${targetDateString}-pvpc.json`;

  if (await fileExists(targetFile)) {
    console.log(`[PVPC] The file exists: ${targetFile}`);
    return;
  }

  const dateForApi = targetDate.format("YYYY-MM-DD");
  const url = new URL(`${API_BASE_URL}/getTomorrowPricesPVPC?sendMessage=false`);
  url.searchParams.set("date", dateForApi);
  const data = await fetchTextIfAvailable(url.toString(), "PVPC");
  if (!data) {
    return;
  }

  const cleanupDate = targetDate.subtract(8, "day").format("YYYY-MM-DD");
  await saveFile(targetFile, data);
  await removeFileIfExists(`${DATA_DIR}/${cleanupDate.replaceAll("-", "")}-pvpc.json`);
  console.log(`💾 [PVPC] New prices were saved to ${targetFile}`);
}

if (isMainModule(import.meta.url)) {
  await runCli("PVPC", () => runPVPC(process.argv[2]));
}
