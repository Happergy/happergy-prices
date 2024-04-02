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
    const hour = data.pvpcToday?.currentPrice?.date && dayjs(data.pvpcToday?.currentPrice?.date).tz("Europe/Madrid").format("HH");
    if (!hour) {
        console.log("❌ Error getting hour from prices file");
        return null;
    }
    return hour;
};

const updatePrices = (force) => {
    const hourLatestPrices = getHourLatestPrices();
    if (force || !hourLatestPrices) {
        console.log(`💡 We need to force update prices from ${hourLatestPrices}:00`);
        require("./prices");
        return true;
    } else if (currentHour !== hourLatestPrices) {
        console.log(`💡 We are at ${currentHour}:00. We need to update prices from ${hourLatestPrices}:00`);
        require("./prices");
        return true;
    } else {
        console.log(`✅ We are at ${currentHour}:00. Prices are from ${hourLatestPrices}:00`);
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

if (!fs.existsSync(getFilePath(tomorrow, 'omie')) && parseInt(currentHour, 10) >= 13) {
    console.log("💡 We need to update OMIE prices");
    require("./omie");
    updatedOMIE = true;
} else {
    if (parseInt(currentHour, 10) < 20) {
        console.log("⏲️ OMIE prices will be updated after 13:00");
    } else {
        console.log("✅ OMIE prices are up to date");
    }
}

// Check if we have pvpc prices for tomorrow
// Check if pvpc file exists for tomorrow
const getPVPCFilePath = (date) => {
    const fileName = `${dayjs(date).format("YYYYMMDD")}-pvpc`;
    const targetFile = "data/" + fileName + ".json";
    return targetFile;
};

if (!fs.existsSync(getPVPCFilePath(tomorrow)) && parseInt(currentHour, 10) >= 20) {
    console.log("💡 We need to update PVPC prices");
    require("./pvpc");
    updatedPVPC = true;
} else {
    if (parseInt(currentHour, 10) < 20) {
        console.log("⏲️ PVPC prices will be updated after 20:00");
    } else {
        console.log("✅ PVPC prices are up to date");
    }
}

const getEcoDataFilePath = (date) => {
    const fileName = `${dayjs(date).format("YYYYMMDD")}-ecoData`;
    const targetFile = "data/" + fileName + ".json";
    return targetFile;
};

if (!fs.existsSync(getEcoDataFilePath(now))) {
    console.log("💡 We need to update ecoData prices");
    require("./ecoData");
}

if (updatedOMIE || updatedPVPC) {
    console.log("💡 Prices will be updated after new prices file");
} else {
    updatePrices();
}

exports.updatePrices = updatePrices;