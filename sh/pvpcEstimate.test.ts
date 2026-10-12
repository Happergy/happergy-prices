import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import {
  applyTomorrowPVPC,
  completeOfficialTomorrow,
  estimatePVPCTomorrow,
  type PricePoint,
  persistSimulatedPVPC,
  resolveTomorrowPVPC,
  simulatedPVPCFilePath,
} from "./pvpcEstimate";
import { TIME_ZONE } from "./runtime";

dayjs.extend(utc);
dayjs.extend(timezone);

function dailyPrices(
  date: string,
  priceAt: (index: number) => number = () => 1_000,
  utcDates = false,
): PricePoint[] {
  const start = dayjs.tz(date, TIME_ZONE);
  const end = dayjs.tz(start.add(1, "day").format("YYYY-MM-DD"), TIME_ZONE);
  const values: PricePoint[] = [];
  for (
    let timestamp = start.valueOf(), index = 0;
    timestamp < end.valueOf();
    timestamp += 60 * 60 * 1000, index += 1
  ) {
    values.push({
      date: utcDates
        ? dayjs(timestamp).toISOString()
        : dayjs(timestamp).tz(TIME_ZONE).format("YYYY-MM-DDTHH:mm:ssZ"),
      price: priceAt(index),
      simulated: false,
    });
  }
  return values;
}

describe("PVPC tomorrow estimate", () => {
  test("uses the fixed 45% OMIE weight with the project's shared price scale", () => {
    const forecast = estimatePVPCTomorrow(
      dailyPrices("2026-10-12", () => 10_000),
      dailyPrices("2026-10-12", () => 1_000),
      dailyPrices("2026-10-13", () => 3_000),
      "2026-10-12",
      "2026-10-13",
    );

    assert.equal(forecast.length, 24);
    assert.equal(forecast[0].price, 10_900);
    assert.equal(forecast[0].simulated, true);
  });

  test("aligns equivalent Madrid hours when PVPC timestamps are UTC", () => {
    const forecast = estimatePVPCTomorrow(
      dailyPrices("2026-10-12", (index) => 20_000 + index, true),
      dailyPrices("2026-10-12", (index) => 1_000 + index),
      dailyPrices("2026-10-13", (index) => 3_000 + index),
      "2026-10-12",
      "2026-10-13",
    );

    assert.equal(forecast[7].price, 20_007 + 900);
    assert.equal(forecast[7].date, "2026-10-13T07:00:00+02:00");
  });

  test("supports the 23-hour spring day and omits its nonexistent local hour", () => {
    const forecast = estimatePVPCTomorrow(
      dailyPrices("2026-03-27"),
      dailyPrices("2026-03-27"),
      dailyPrices("2026-03-29"),
      "2026-03-27",
      "2026-03-29",
    );

    assert.equal(forecast.length, 23);
    assert.equal(
      forecast.some(({ date }) => date.startsWith("2026-03-29T02:")),
      false,
    );
  });

  test("preserves both official autumn hours and errors on an unpairable second occurrence", () => {
    const autumnOfficial = completeOfficialTomorrow(dailyPrices("2026-10-25"), "2026-10-25");
    assert.equal(autumnOfficial?.length, 25);
    assert.equal(autumnOfficial?.[2].date, "2026-10-25T02:00:00+02:00");
    assert.equal(autumnOfficial?.[3].date, "2026-10-25T02:00:00+01:00");

    assert.throws(
      () =>
        estimatePVPCTomorrow(
          dailyPrices("2026-10-23"),
          dailyPrices("2026-10-23"),
          dailyPrices("2026-10-25"),
          "2026-10-23",
          "2026-10-25",
        ),
      /occurrence 2/,
    );
  });

  test("rejects missing, incomplete, misdated, or simulated reference data", () => {
    const reference = dailyPrices("2026-10-12");
    const omieTomorrow = dailyPrices("2026-10-13");
    const validOMIEYesterday = dailyPrices("2026-10-12");

    assert.throws(
      () =>
        estimatePVPCTomorrow(
          undefined,
          validOMIEYesterday,
          omieTomorrow,
          "2026-10-12",
          "2026-10-13",
        ),
      /Missing or invalid official PVPC yesterday/,
    );
    assert.throws(
      () => estimatePVPCTomorrow(reference, undefined, omieTomorrow, "2026-10-12", "2026-10-13"),
      /Missing or invalid OMIE yesterday/,
    );
    assert.throws(
      () =>
        estimatePVPCTomorrow(reference, validOMIEYesterday, undefined, "2026-10-12", "2026-10-13"),
      /Missing or invalid OMIE tomorrow/,
    );
    assert.throws(
      () =>
        estimatePVPCTomorrow(
          reference.slice(1),
          validOMIEYesterday,
          omieTomorrow,
          "2026-10-12",
          "2026-10-13",
        ),
      /Incomplete official PVPC yesterday/,
    );
    assert.throws(
      () =>
        estimatePVPCTomorrow(
          reference,
          validOMIEYesterday.slice(1),
          omieTomorrow,
          "2026-10-12",
          "2026-10-13",
        ),
      /Incomplete OMIE yesterday/,
    );
    assert.throws(
      () =>
        estimatePVPCTomorrow(
          reference,
          validOMIEYesterday,
          omieTomorrow.slice(1),
          "2026-10-12",
          "2026-10-13",
        ),
      /Incomplete OMIE tomorrow/,
    );
    assert.throws(
      () =>
        estimatePVPCTomorrow(
          reference.map((point) => ({ ...point, simulated: true })),
          validOMIEYesterday,
          omieTomorrow,
          "2026-10-12",
          "2026-10-13",
        ),
      /simulated, not official/,
    );
    assert.throws(
      () =>
        estimatePVPCTomorrow(
          reference.map((point, index) =>
            index === 0 ? { ...point, date: "2026-10-11T21:00:00Z" } : point,
          ),
          validOMIEYesterday,
          omieTomorrow,
          "2026-10-12",
          "2026-10-13",
        ),
      /not for 2026-10-12/,
    );
  });

  test("prefers a complete official day and removes simulated markers", async () => {
    const tomorrow = "2099-01-01";
    const officialSource = dailyPrices(tomorrow, (index) => 15_000 + index);
    const official = completeOfficialTomorrow(officialSource, tomorrow);
    assert.ok(official);
    const forecastResult = await resolveTomorrowPVPC(officialSource, "2098-12-31", tomorrow);
    assert.equal(forecastResult.kind, "official");

    const payload: Record<string, unknown> = {
      pvpc: {
        nextPrices: [
          { date: "2098-12-31T23:00:00+01:00", price: 12_000, simulated: false },
          ...dailyPrices(tomorrow).map((point) => ({ ...point, simulated: true })),
        ],
      },
      pvpcTomorrow: { currentPrice: { simulated: true } },
    };
    applyTomorrowPVPC(payload, forecastResult, tomorrow);

    const updatedPVPC = payload.pvpc as { nextPrices: PricePoint[] };
    assert.equal(updatedPVPC.nextPrices.length, 25);
    assert.equal(updatedPVPC.nextPrices[0].date, "2098-12-31T23:00:00+01:00");
    assert.equal(updatedPVPC.nextPrices[1].price, 15_000);
    assert.equal(updatedPVPC.nextPrices[1].simulated, false);
    assert.equal(
      (payload.pvpcTomorrow as { currentPrice: PricePoint }).currentPrice.simulated,
      false,
    );
  });

  test("marks every estimate simulated and exposes no partial day when unavailable", async () => {
    const tomorrow = "2099-01-01";
    const forecast = dailyPrices(tomorrow, (index) => 10_000 + index).map((point) => ({
      ...point,
      simulated: true,
    }));
    const unavailable = await resolveTomorrowPVPC(forecast, "2098-12-31", tomorrow);
    assert.equal(unavailable.kind, "unavailable");
    assert.match(unavailable.reason ?? "", /PVPC yesterday.*OMIE yesterday.*OMIE tomorrow/);

    const payload: Record<string, unknown> = {
      pvpc: { nextPrices: forecast },
      pvpcTomorrow: { avgPrice: 10_000 },
    };

    applyTomorrowPVPC(payload, { kind: "estimated", prices: forecast }, tomorrow);
    const estimated = payload.pvpc as { nextPrices: PricePoint[] };
    assert.equal(estimated.nextPrices.length, 24);
    assert.ok(estimated.nextPrices.every(({ simulated }) => simulated === true));
    assert.equal(
      (payload.pvpcTomorrow as { currentPrice: PricePoint }).currentPrice.simulated,
      true,
    );

    applyTomorrowPVPC(payload, unavailable, tomorrow);
    assert.deepEqual((payload.pvpc as { nextPrices: PricePoint[] }).nextPrices, []);
    assert.equal(payload.pvpcTomorrow, null);
  });

  test("writes the estimated OMIE date to a separate simulated PVPC file", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "happergy-pvpc-"));
    const tomorrow = "2026-10-13";
    const path = simulatedPVPCFilePath(tomorrow, dataDir);
    const prices = dailyPrices(tomorrow).map((point) => ({ ...point, simulated: true }));

    try {
      assert.equal(path, join(dataDir, "20261013-pvpc-simulated.json"));
      await persistSimulatedPVPC({ kind: "estimated", prices }, tomorrow, dataDir);
      assert.deepEqual(JSON.parse(await readFile(path, "utf8")), prices);

      await persistSimulatedPVPC(
        { kind: "official", prices: dailyPrices(tomorrow) },
        tomorrow,
        dataDir,
      );
      await assert.rejects(readFile(path, "utf8"), { code: "ENOENT" });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
