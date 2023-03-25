// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const Papa = require("papaparse");
dayjs.extend(utc);
dayjs.extend(timezone);

const tomorrow = dayjs().tz("Europe/Madrid").add(1, "day").format("YYYYMMDD");
const twoDaysAgo = dayjs()
  .tz("Europe/Madrid")
  .subtract(2, "day")
  .format("YYYY-MM-DD");

const getFilePath = (date) => {
  const fileName = `${dayjs(date).format("YYYYMMDD")}-omie`;
  const targetFile = "data/" + fileName + ".json";
  return targetFile;
};

const parsePriceDateOMIE = (prices) =>
  prices.map((item) => {
    const year = item[0];
    const month = item[1];
    const day = item[2];
    const hour = item[3];
    const price = parseInt((parseFloat(item[5]) * 100).toString(), 10);
    const date = dayjs
      .tz(`${year}-${month}-${day} ${hour - 1}:00`, "Europe/Madrid")
      .format();

    return {
      date,
      price,
    };
  });

request.get(
  `https://www.omie.es/es/file-download?parents[0]=marginalpdbc&filename=marginalpdbc_${tomorrow}.1`,
  {},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const targetFilePath = getFilePath(tomorrow);
      const removeFilePath = getFilePath(twoDaysAgo);

      if (fs.existsSync(removeFilePath)) {
        fs.unlink(removeFilePath, (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log(`[OMIE] The file was deleted: ${removeFilePath}`);
        });
      }

      try {
        if (fs.existsSync(targetFilePath)) {
          console.log(`[OMIE] The file exists: ${targetFilePath}`);
        } else {
          if (!body) {
            console.log("[OMIE] No data");
            return;
          }

          const config = {
            download: false,
            delimiter: ";",
            comments: "MARGINALPDBC",
            preview: 24,
            skipEmptyLines: true,
          };

          const data = parsePriceDateOMIE(Papa.parse(body, config).data);

          fs.writeFile(targetFilePath, JSON.stringify(data), function (err) {
            if (err) {
              return console.log(err);
            }
            console.log("[OMIE] The file " + targetFilePath + " was saved!");
          });
          const now = dayjs().tz("Europe/Madrid");
          fs.appendFile(
            "data/log.md",
            "\n- 📉 __" + now.format("YYYY-MM-DD HH:mm:ss") + " [OMIE]__",
            function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("[OMIE] The file log.md was updated!");
            }
          );
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
);
