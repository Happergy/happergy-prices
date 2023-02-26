// Node script to get JSON from a URL and write it to a file. Then the file is committed to the repo and pushed to GitHub.
var fs = require("fs");
var request = require("request");
var dayjs = require("dayjs");
var utc = require("dayjs/plugin/utc");
var timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

// Make the following curl call to get the JSON from the API
// curl 'https://api.happergy.es/bestMomentDevices' \
//  -H 'Content-Type: application/json' \
//  --data-raw '{"config":[{"id":"generic1","duration":1},{"id":"generic2","duration":2},{"id":"generic4","duration":4},{"id":"generic6","duration":6},{"id":"washing","name":"washing","category":"washing","duration":2,"consumptionKWh":0.82,"showStartTime":true},{"id":"dishwasher","category":"dishwasher","name":"Lavavajillas","consumptionKWh":0.95,"customLabel":true,"duration":1,"timesPerMonth":null,"rangeStart":0,"rangeEnd":1,"showStartTime":true},{"id":"oven","name":"oven","category":"oven","duration":1,"consumptionKWh":0.81,"rangeStart":11,"rangeEnd":15,"showStartTime":true},{"id":"1644020579294","category":"charger","name":"BMW i3","consumptionKWh":10,"customLabel":true,"duration":8,"timesPerMonth":null,"rangeStart":0,"rangeEnd":0,"showStartTime":true},{"id":"1654899947976","category":"logo","name":"Name","consumptionKWh":0.82,"customLabel":true,"duration":4,"timesPerMonth":null,"rangeStart":22,"rangeEnd":8,"showStartTime":true}],"tariff":"PCB"}' \
//  --compressed

// make a post request to the API with an object containing the config and tariff
request.post(
  "https://api.happergy.es/bestMomentDevices",
  {
    json: {
      config: [
        {
          id: "generic1",
          duration: 1,
        },
        {
          id: "generic2",
          duration: 2,
        },
        {
          id: "generic4",
          duration: 4,
        },
        {
          id: "generic6",
          duration: 6,
        },
      ],
      tariff: "PCB",
    },
  },
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const now = dayjs().tz("Europe/Madrid").format("YYYYMMDD");
      console.log(now);

      fs.writeFile(
        "data/" + now + ".json",
        JSON.stringify(body),
        function (err) {
          if (err) {
            return console.log(err);
          }
          console.log("The file was saved!");
        }
      );

      // write the response body to a file
      // fs.writeFile("bestMomentDevices.json", body, function (err) {
      //   if (err) {
      //     return console.log(err);
      //   }
      //   console.log("The file was saved!");
      // });
    }
  }
);
