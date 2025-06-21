// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);


// Allow passing a date as a string argument (YYYYMMDD or YYYY-MM-DD)
const inputDateStr = process.argv[2];
let targetDate;
if (inputDateStr) {
  // Try to parse as YYYYMMDD or YYYY-MM-DD
  if (/^\d{8}$/.test(inputDateStr)) {
    targetDate = dayjs(inputDateStr, "YYYYMMDD").tz("Europe/Madrid");
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(inputDateStr)) {
    targetDate = dayjs(inputDateStr).tz("Europe/Madrid");
  } else {
    console.error("[PVPC] Invalid date format. Use YYYYMMDD or YYYY-MM-DD.");
    process.exit(1);
  }
} else {
  targetDate = dayjs().tz("Europe/Madrid").add(1, "day");
}

const targetDateStr = targetDate.format("YYYYMMDD");
const weekAgo = targetDate.clone().subtract(8, "day").format("YYYY-MM-DD");


const getFilePath = (date) => {
  const fileName = `${dayjs(date).format("YYYYMMDD")}-pvpc`;
  const targetFile = "data/" + fileName + ".json";
  return targetFile;
};

const targetFilePath = getFilePath(targetDateStr);

try {
  if (fs.existsSync(targetFilePath)) {
    console.log(`[PVPC] The file exists: ${targetFilePath}`);
  } else {
    request.get(
      `https://us-central1-best-price-pvpc.cloudfunctions.net/getTomorrowPricesPVPC?date=${targetDateStr}`,
      {},
      function (error, response, data) {
        if (error) {
          console.error("[PVPC] Error fetching data");
          console.error(error);
          return;
        }
        if (response.statusCode == 200) {
          const removeFilePath = getFilePath(weekAgo);

          console.log('PVPC DATA', data)

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

            fs.writeFile(targetFilePath, data, function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("💾 [PVPC] New prices were saved");
            });

            // Update prices
            // require("./check.js").updatePrices(true);
          } catch (err) {
            console.error(err);
          }
        } else {
          console.error("[PVPC] " + response.statusCode + " Prices not yet available");
          // Update prices
          // require("./check.js").updatePrices();
        }
      }
    );
    // Update prices
    require("./check.js").updatePrices(true);
  }
} catch (err) {
  console.error(err);
}
