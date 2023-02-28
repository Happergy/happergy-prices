// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const Papa = require("papaparse");
dayjs.extend(utc);
dayjs.extend(timezone);

const tomorrow = dayjs().tz("Europe/Madrid").add(0, "day").format("YYYYMMDD");

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
      const fileName = `${tomorrow}-omie`;
      const targetFile = "data/" + fileName + ".json";
      try {
        if (fs.existsSync(targetFile)) {
          console.log(`[OMIE] The file exists: ${targetFile}`);
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

          fs.writeFile(
            "data/" + fileName + ".json",
            JSON.stringify(data),
            function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("[OMIE] The file " + fileName + ".json was saved!");
            }
          );
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
);
