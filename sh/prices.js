// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo to GitHub.
var fs = require("fs");
var request = require("request");
var dayjs = require("dayjs");
var utc = require("dayjs/plugin/utc");
var timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const TARGET_FILE = "happergy.json";
const OMIE_FILE = "happergy-omie.json";
const PVPC_FILE = "happergy-pvpc.json";

request.get(
  "https://us-central1-best-price-pvpc.cloudfunctions.net/generic",
  {},
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('body', body)
      const prices = JSON.parse(body);
      const omiePrices = {
        omie: {
          prices: prices.omie,
          lastUpdated: dayjs().tz("Europe/Madrid").format("YYYY-MM-DD HH:mm:ss"),
        },
      }
      const pvpcPrices = {
        pvpc: {
          prices: prices.pvpc,
          lastUpdated: dayjs().tz("Europe/Madrid").format("YYYY-MM-DD HH:mm:ss"),
        },
        pvpcToday: prices.pvpcToday,
        pvpcTomorrow: prices.pvpcTomorrow,
      }
      fs.writeFile("data/" + OMIE_FILE, JSON.stringify(omiePrices), function (err) {
        if (err) {
          return console.log(err);
        }
        console.log("🔥 The file " + OMIE_FILE + " was updated!");
      });
      fs.writeFile("data/" + PVPC_FILE, JSON.stringify(pvpcPrices), function (err) {
        if (err) {
          return console.log(err);
        }
        console.log("🔥 The file " + PVPC_FILE + " was updated!");
      });
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
