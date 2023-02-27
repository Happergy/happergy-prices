// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
const fs = require("fs");
const request = require("request");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

request.get(
  "https://api.esios.ree.es/archives/70/download_json",
  {},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const now = dayjs().tz("Europe/Madrid").format("YYYYMMDD");

      const fileName = `pvpc-${now}`;
      const targetFile = "data/" + fileName + ".json";
      try {
        if (fs.existsSync(targetFile)) {
          //file exists
          console.log("The file exists");
        } else {
          const data = JSON.parse(body).PVPC.map(
            ({ PCB, Dia, Hora, PMHPCB, TEUPCB, EDCGASPCB }) => ({
              Dia,
              Hora,
              PCB,
              PMHPCB,
              TEUPCB,
              EDCGASPCB,
            })
          );
          fs.writeFile(
            "data/" + fileName + ".json",
            JSON.stringify(data),
            function (err) {
              if (err) {
                return console.log(err);
              }
              console.log("The file" + fileName + ".json was saved!");
            }
          );
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
);
