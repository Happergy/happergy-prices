// Node script to check if we need to 
// - update the prices with prices.js script
// - check OMIE prices with omie.js script
// - check pvpc prices with pvpc.js script 
// and commit and push the changes to GitHub.

const fs = require("fs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const now = dayjs().tz("Europe/Madrid");
const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
const currentHour = now.format("HH");

let updatedOMIE = false;
let updatedPVPC = false;

// Get hour for the latest prices
const getHourLatestPrices = () => {
    const fileName = 'happergy';
    const targetFile = "data/" + fileName + ".json";
    const file = fs.readFileSync(targetFile, "utf8");
    const data = JSON.parse(file);
    const hour = dayjs(data.pvpcToday.currentPrice.date).tz("Europe/Madrid").format("HH");
    return hour;
};

const updatePrices = () => {
    const hourLatestPrices = getHourLatestPrices();
    if(currentHour !== hourLatestPrices) {
        console.log("💡 We need to update prices");
        require("./prices");
        return true;
    } else {
        console.log("✅ Prices are up to date");
        return false;
    }
};

// Check if we have omie prices for tomorrow
// Check if omie file exists for tomorrow
const getFilePath = (date) => {
    const fileName = `${dayjs(date).format("YYYYMMDD")}-omie`;
    const targetFile = "data/" + fileName + ".json";
    return targetFile;
};

if(!fs.existsSync(getFilePath(tomorrow, 'omie'))) {
    console.log("💡 We need to update OMIE prices");
    require("./omie");
    updatedOMIE = true;
} else {
    console.log("✅ OMIE prices are up to date");
}

// Check if we have pvpc prices for tomorrow
// Check if pvpc file exists for tomorrow
const getPVPCFilePath = (date) => {
    const fileName = `${dayjs(date).format("YYYYMMDD")}-pvpc`;
    const targetFile = "data/" + fileName + ".json";
    return targetFile;
};

if(!fs.existsSync(getPVPCFilePath(tomorrow))) {
    console.log("💡 We need to update PVPC prices");
    require("./pvpc");
    updatedPVPC = true;
} else {
    console.log("✅ PVPC prices are up to date");
}

if (updatedOMIE || updatedPVPC) {
    console.log("💡 Prices will be updated after new prices file");
} else {
    updatePrices();
}

exports.updatePrices = updatePrices;