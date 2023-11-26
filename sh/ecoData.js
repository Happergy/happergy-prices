// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const CLEANUP_DAYS = 2;
const DEFAULT_FORMAT = "YYYY-MM-DD";

const now = dayjs().format("YYYYMMDD");
const weekAgo = dayjs().subtract(CLEANUP_DAYS, "day").format(DEFAULT_FORMAT);

const getFilePath = (date) => {
  const fileName = `${dayjs(date).format("YYYYMMDD")}-ecoData`;
  const targetFile = "data/" + fileName + ".json";
  return targetFile;
};

const targetFilePath = getFilePath(now);
const lastUpdatedPath = "data/ecoData.json";

try {
  if (fs.existsSync(targetFilePath)) {
    console.log(`[EcoData] The file exists: ${targetFilePath}`);
  } else {
    request.get(
      `https://us-central1-best-price-pvpc.cloudfunctions.net/getLastUpdatedEcoData`,
      {},
      function (error, response, data) {
        if (error) {
          console.error("[EcoData] Error fetching data");
          console.error(error);
          return;
        }
        if (response.statusCode == 200) {
          const ecoDataDate = dayjs(JSON.parse(data).date).format(DEFAULT_FORMAT);
          if (fs.existsSync(getFilePath(ecoDataDate))) {
            console.log(`[EcoData] The file exists: ${getFilePath(ecoDataDate)}`);
            return;
          }

          const removeFilePath = getFilePath(weekAgo);

          try {
            if (fs.existsSync(removeFilePath)) {
              fs.unlink(removeFilePath, (err) => {
                if (err) {
                  console.error(err);
                  return;
                }
                console.log(`🗑️ [EcoData] Clean files: ${removeFilePath}`);
              });
            }

            if (!data || data.length === 0) {
              console.log("[EcoData] No data");
              return false;
            }

            fs.writeFile(targetFilePath, data, function (err) {
              if (err) {
                return console.log(err);
              }
            });
            fs.writeFile(lastUpdatedPath, data, function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("💾 [EcoData] Last ecoData updated");
            });
          } catch (err) {
            console.error(err);
          }
        }
        else {
          console.error("[EcoData] " + response.statusCode + " Prices not yet available");
        }
      }
    );
  }
} catch (err) {
  console.error(err);
}
