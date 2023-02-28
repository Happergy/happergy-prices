// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
var fs = require("fs");
var request = require("request");
var dayjs = require("dayjs");
var utc = require("dayjs/plugin/utc");
var timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

request.post(
  "https://api.happergy.es/bestMomentDevices",
  {
    json: {
      config: [
        {
          id: "generic1",
          duration: 1,

          consumptionKWh: 1,
        },
        {
          id: "generic2",
          duration: 2,
          consumptionKWh: 1,
        },
        {
          id: "generic4",
          duration: 4,
          consumptionKWh: 1,
        },
        {
          id: "generic6",
          duration: 6,
          consumptionKWh: 1,
        },
      ],
      tariff: "PCB",
    },
  },
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const now = dayjs().tz("Europe/Madrid").format("YYYYMMDD");
      fs.writeFile(
        "data/" + now + ".json",
        JSON.stringify(body),
        function (err) {
          if (err) {
            return console.log(err);
          }
          console.log("[Prices] The file " + now + ".json was saved!");
        }
      );
    }
  }
);
