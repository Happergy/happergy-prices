// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const tomorrow = dayjs().tz("Europe/Madrid").add(1, "day").format("YYYY-MM-DD");
const twoDaysAgo = dayjs()
  .tz("Europe/Madrid")
  .subtract(2, "day")
  .format("YYYY-MM-DD");

const getFilePath = (date) => {
  const fileName = `${dayjs(date).format("YYYYMMDD")}-pvpc`;
  const targetFile = "data/" + fileName + ".json";
  return targetFile;
};

request.get(
  `https://api.esios.ree.es/archives/70/download_json?date=${tomorrow}`,
  {},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const targetFilePath = getFilePath(tomorrow);
      const removeFilePath = getFilePath(twoDaysAgo);

      try {
        if (fs.existsSync(removeFilePath)) {
          fs.unlink(removeFilePath, (err) => {
            if (err) {
              console.error(err);
              return;
            }
            console.log(`[PVPC] The file was deleted: ${removeFilePath}`);
          });
        }

        if (fs.existsSync(targetFilePath)) {
          console.log(`[PVPC] The file exists: ${targetFilePath}`);
        } else {
          const { PVPC: pvpc, message } = JSON.parse(body);
          if (!pvpc) {
            if (message) {
              console.log(`[PVPC] ${message}`);
            } else {
              console.log("[PVPC] No data");
            }
            return;
          }
          const data = pvpc.map(
            ({ PCB, Dia, Hora, PMHPCB, TEUPCB, EDCGASPCB }) => ({
              Dia,
              Hora,
              PCB,
              PMHPCB,
              TEUPCB,
              EDCGASPCB,
            })
          );
          fs.writeFile(targetFilePath, JSON.stringify(data), function (err) {
            if (err) {
              return console.log(err);
            }
            console.log("[PVPC] The file " + targetFilePath + " was saved!");
          });
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
);
