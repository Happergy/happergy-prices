// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo to GitHub.
var fs = require("fs");
var request = require("request");
var dayjs = require("dayjs");
var utc = require("dayjs/plugin/utc");
var timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const TARGET_FILE = "happergy.json";

request.get(
  "https://us-central1-best-price-pvpc.cloudfunctions.net/generic",
  {},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const now = dayjs().tz("Europe/Madrid");
      // body = JSON.parse(body);
      // body.lastUpdate = now.format("YYYY-MM-DD HH:mm:ss");
      // body = JSON.stringify(body);

      fs.writeFile("data/" + TARGET_FILE, body, function (err) {
        if (err) {
          return console.log(err);
        }
        console.log("🔥 The file " + TARGET_FILE + " was updated!");
      });
    } else {
      console.error("🔥 Error fetching data");
    }
  }
);
