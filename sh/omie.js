// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

console.log("[OMIE] Checking OMIE prices");

const tomorrow = dayjs().tz("Europe/Madrid").add(1, "day").format("YYYYMMDD");
const weekAgo = dayjs()
  .tz("Europe/Madrid")
  .subtract(8, "day")
  .format("YYYY-MM-DD");

const getFilePath = (date) => {
  const fileName = `${dayjs(date).format("YYYYMMDD")}-omie`;
  const targetFile = "data/" + fileName + ".json";
  return targetFile;
};

const targetFilePath = getFilePath(tomorrow);

try {
  if (fs.existsSync(targetFilePath)) {
    console.log(`[OMIE] The file exists: ${targetFilePath}`);
  } else {
    request.get(
      `https://us-central1-best-price-pvpc.cloudfunctions.net/getTomorrowPricesOMIE`,
      {},
      function (error, response, data) {
        if (!error && response.statusCode == 200) {
          const removeFilePath = getFilePath(weekAgo);
    
          try {
            if (fs.existsSync(removeFilePath)) {
              fs.unlink(removeFilePath, (err) => {
                if (err) {
                  console.error(err);
                  return;
                }
                console.log(`🗑️ [OMIE] Clean files: ${removeFilePath}`);
              });
            }
    
            if (!data || data.length === 0) {
              console.log("[OMIE] No data");
              return false;
            }
    
            fs.writeFile(targetFilePath, data, function (err) {
              if (err) {
                return console.error(err);
              }
              console.log("💾 [OMIE] New prices were saved");
            });

            request.get(
              `https://us-central1-best-price-pvpc.cloudfunctions.net/simulatePVPC`,
              {},
              function (error, response, data) {
                console.log('data', data)
                if (!error && response.statusCode == 200) {
                  fs.writeFile('data/pvpc.json', data, function (err) {
                    if (err) {
                      return console.error(err);
                    }
                    console.log("💾 [PVPC simulation] New prices were saved");
                  });

                }
              }
            );

            require("./check.js").updatePrices(true);
          } catch (err) {
            console.error(err);
          }
        } else {
          console.error("[OMIE] Error fetching data");
          require("./check.js").updatePrices();
        }
      }
    );
  }
} catch (err) {
  console.error(err);
}
