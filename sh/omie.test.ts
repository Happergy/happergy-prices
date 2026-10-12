import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { buildOMIEUrl, getOMIEPrices, parseOMIECsv, runOMIE } from "./omie";
import { TIME_ZONE } from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

function localDate(value: string): dayjs.Dayjs {
  return dayjs.tz(value, TIME_ZONE);
}

function hourlyCsv(date: string, count: number, price = "200.49"): string {
  const [year, month, day] = date.split("-");
  const rows = Array.from(
    { length: count },
    (_, index) => `${year};${month};${day};${index + 1};${price};${price};`,
  );
  return `# official data\nMARGINALPDBC;\n${rows.join("\n")}\n*`;
}

describe("OMIE price retrieval", () => {
  test("builds the official URL for the requested Madrid date", () => {
    assert.equal(
      buildOMIEUrl(localDate("2026-10-12")),
      "https://www.omie.es/es/file-download?parents=marginalpdbc&filename=marginalpdbc_20261012.1",
    );
  });

  test("parses the official semicolon CSV, ignores headers and converts EUR/MWh", () => {
    const csv = [
      "MARGINALPDBC;",
      "Year;Month;Day;Period;Spain;Portugal;",
      "# generated file",
      "",
      hourlyCsv("2026-10-12", 24).split("\n").slice(2).join("\n"),
    ].join("\n");

    const prices = parseOMIECsv(csv, localDate("2026-10-12"));
    assert.equal(prices.length, 24);
    assert.deepEqual(prices[0], { date: "2026-10-12T00:00:00+02:00", price: 20049 });
  });

  test("rejects invalid data and dates while ignoring blank and comment rows", () => {
    const date = localDate("2026-10-12");
    const validRows = hourlyCsv("2026-10-12", 24).split("\n").slice(2);

    assert.throws(
      () =>
        parseOMIECsv(
          [
            "MARGINALPDBC;",
            "# ignored",
            ...validRows.slice(0, 23),
            "2026;10;12;24;not-a-price;1;",
          ].join("\n"),
          date,
        ),
      /Invalid Spanish OMIE price/,
    );
    assert.throws(() => parseOMIECsv(hourlyCsv("2026-10-11", 24), date), /expected 2026-10-12/);
    assert.doesNotThrow(() =>
      parseOMIECsv(
        ["MARGINALPDBC;", ...validRows.slice(0, 23), "2026;10;12;24;200.49;200.49;"].join("\n"),
        date,
      ),
    );
  });

  test("averages four quarter-hour prices into one hourly price", () => {
    const date = localDate("2026-10-12");
    const csv = hourlyCsv("2026-10-12", 96, "100.00").split("\n");
    csv[2] = "2026;10;12;1;100.00;100.00;";
    csv[3] = "2026;10;12;2;200.00;200.00;";
    csv[4] = "2026;10;12;3;300.00;300.00;";
    csv[5] = "2026;10;12;4;400.00;400.00;";

    const prices = parseOMIECsv(csv.join("\n"), date);
    assert.equal(prices.length, 24);
    assert.equal(prices[0].price, 25000);
    assert.equal(prices[1].price, 10000);
  });

  test("returns exactly 23, 24, and 25 hours and preserves the repeated autumn hour", () => {
    const spring = parseOMIECsv(hourlyCsv("2026-03-29", 23), localDate("2026-03-29"));
    const normal = parseOMIECsv(hourlyCsv("2026-10-12", 24), localDate("2026-10-12"));
    const autumn = parseOMIECsv(hourlyCsv("2026-10-25", 25), localDate("2026-10-25"));

    assert.equal(spring.length, 23);
    assert.equal(
      spring.some(({ date }) => date.startsWith("2026-03-29T02:")),
      false,
    );
    assert.equal(normal.length, 24);
    assert.equal(autumn.length, 25);
    assert.equal(autumn[2].date, "2026-10-25T02:00:00+02:00");
    assert.equal(autumn[3].date, "2026-10-25T02:00:00+01:00");
  });

  test("rejects missing or unordered periods instead of returning partial data", () => {
    const date = localDate("2026-10-12");
    const missingPeriod = hourlyCsv("2026-10-12", 23);
    const unordered = hourlyCsv("2026-10-12", 24).replace(
      "2026;10;12;1;200.49;200.49;",
      "2026;10;12;2;200.49;200.49;",
    );

    assert.throws(() => parseOMIECsv(missingPeriod, date), /Incomplete OMIE data/);
    assert.throws(() => parseOMIECsv(unordered, date), /Incomplete or unordered/);
  });

  test("reports unpublished data explicitly and rejects HTTP errors", async () => {
    const date = localDate("2026-10-12");
    const unpublished: typeof fetch = async () => new Response("", { status: 404 });
    const failure: typeof fetch = async () =>
      new Response("temporarily unavailable", { status: 503, statusText: "Unavailable" });

    assert.equal(await getOMIEPrices(date, unpublished), null);
    await assert.rejects(getOMIEPrices(date, failure), /OMIE: HTTP 503 Unavailable/);
  });

  test("returns validated JSON-ready application prices from a successful response", async () => {
    const date = localDate("2026-10-12");
    const fetcher: typeof fetch = async () => new Response(hourlyCsv("2026-10-12", 24));

    const payload = JSON.parse(JSON.stringify(await getOMIEPrices(date, fetcher))) as unknown;
    assert.ok(Array.isArray(payload));
    assert.equal(payload.length, 24);
    assert.ok(
      payload.some(
        (price) =>
          typeof price === "object" &&
          price !== null &&
          "date" in price &&
          price.date === "2026-10-12T00:00:00+02:00" &&
          "price" in price &&
          price.price === 20049,
      ),
    );
  });

  test("skips the OMIE API request when the queried day already has a simulated PVPC file", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "happergy-omie-"));
    const simulatedFile = join(dataDir, "20990101-pvpc-simulated.json");
    let called = false;

    try {
      await writeFile(simulatedFile, "[]", "utf8");
      const fetcher: typeof fetch = async () => {
        called = true;
        throw new Error("OMIE API should not be called");
      };

      assert.equal(await runOMIE("20990101", fetcher, dataDir), false);
      assert.equal(called, false);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
