// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const tomorrow = dayjs().tz("Europe/Madrid").add(1, "day").format("YYYYMMDD");
const weekAgo = dayjs()
  .tz("Europe/Madrid")
  .subtract(8, "day")
  .format("YYYY-MM-DD");

const getFilePath = (date) => {
  const fileName = `${dayjs(date).format("YYYYMMDD")}-pvpc`;
  const targetFile = "data/" + fileName + ".json";
  return targetFile;
};

const targetFilePath = getFilePath(tomorrow);

try {
  if (fs.existsSync(targetFilePath)) {
    console.log(`[PVPC] The file exists: ${targetFilePath}`);
  } else {
    request.get(
      `https://us-central1-best-price-pvpc.cloudfunctions.net/getTomorrowPricesPVPC?sendMessage=false&date=2023-11-06`,
      {},
      function (error, response, data) {
        if (error) {
          console.error("[PVPC] Error fetching data");
          console.error(error);
          return;
        }
        if (response.statusCode == 200) {
          const removeFilePath = getFilePath(weekAgo);

          try {
            if (fs.existsSync(removeFilePath)) {
              fs.unlink(removeFilePath, (err) => {
                if (err) {
                  console.error(err);
                  return;
                }
                console.log(`🗑️ [PVPC] Clean files: ${removeFilePath}`);
              });
            }

            if (!data || data.length === 0) {
              console.log("[PVPC] No data");
              return false;
            }

            const objectData = JSON.parse(data);
            console.log('data response', objectData);
            console.log('pvpc parsed', objectData.parsedPVPC);
            const { parsedPVPC } = objectData;

            fs.writeFile(targetFilePath, JSON.stringify(parsedPVPC), function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("💾 [PVPC] New prices were saved");
            });

            // Update prices
            require("./check.js").updatePrices(true);
          } catch (err) {
            console.error(err);
          }
        }
        else {
          console.error("[PVPC] " + response.statusCode + " Prices not yet available");

          // Update prices
          require("./check.js").updatePrices();
          return;
        }
      }
    );
  }
} catch (err) {
  console.error(err);
}
