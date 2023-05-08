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
      `https://us-central1-best-price-pvpc.cloudfunctions.net/getTomorrowPricesOMIE?sendMessage=false`,
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
                console.log(`[OMIE] The file was deleted: ${removeFilePath}`);
              });
            }
    
            console.log("data ", data);
            if (!data || data.length === 0) {
              console.log("[OMIE] No data");
              return false;
            }
    
            fs.writeFile(targetFilePath, data, function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("[OMIE] Happergy prices file " + targetFilePath + " was saved!");
            });
    
            const now = dayjs().tz("Europe/Madrid");
            fs.appendFile(
              "data/log.md",
              "\n- 📉 __" + now.format("HH:mm:ss") + " [OMIE]__",
              function (err) {
                if (err) {
                  return console.log(err);
                }
                console.log("[OMIE] Happergy prices file log.md was updated!");
              }
            );
          } catch (err) {
            console.error(err);
          }
        }
      }
    );
  }
} catch (err) {
  console.error(err);
}
