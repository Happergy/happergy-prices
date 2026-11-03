import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { completeMissingPVPCMetadata } from "./prices";

describe("generic PVPC metadata fallback", () => {
  test("creates devices and summary when generic returns them empty", () => {
    const prices = {
      omie: {},
      pvpc: {
        nextPrices: [30_000, 10_000, 20_000, 40_000, 50_000, 60_000, 70_000, 80_000].map(
          (price, hour) => ({
            date: `2026-11-03T${String(hour).padStart(2, "0")}:00:00Z`,
            price,
            simulated: false,
          }),
        ),
      },
      pvpcToday: {
        avgPrice: 45_000,
        bestPrice: { date: "2026-11-03T01:00:00Z", price: 10_000, simulated: false },
        currentPrice: { date: "2026-11-03T00:00:00Z", price: 30_000, simulated: false },
        worstPrice: { date: "2026-11-03T07:00:00Z", price: 80_000, simulated: false },
      },
      pvpcTomorrow: {},
    };

    completeMissingPVPCMetadata(prices, "2026-11-03");

    const pvpc = prices.pvpc as typeof prices.pvpc & {
      devices: Record<string, unknown>[];
      summary: Record<string, unknown>;
    };
    const devices = pvpc.devices;
    assert.equal(devices.length, 8);
    assert.deepEqual(devices[0], {
      id: "generic1",
      duration: "1",
      consumptionKWh: "1",
      isOutOfRange: false,
      startTime: "2026-11-03T01:00:00+00:00",
      endTime: "2026-11-03T02:00:00+00:00",
      currentCost: "0.30",
      cheapestCost: "0.10",
      costSavings: 0.19999999999999998,
    });
    assert.deepEqual(pvpc.summary, {
      avgPrice: 45_000,
      bestPrice: { date: "2026-11-03T01:00:00Z", price: 10_000 },
      currentPrice: { date: "2026-11-03T00:00:00Z", price: 30_000 },
      worstPrice: { date: "2026-11-03T07:00:00Z", price: 80_000 },
    });
  });

  test("preserves devices and summary returned by generic", () => {
    const devices = [{ id: "api-device" }];
    const summary = { avgPrice: 123 };
    const prices = {
      omie: {},
      pvpc: { nextPrices: [], devices, summary },
      pvpcToday: {},
      pvpcTomorrow: {},
    };

    completeMissingPVPCMetadata(prices, "2026-11-03");

    assert.equal(prices.pvpc.devices, devices);
    assert.equal(prices.pvpc.summary, summary);
  });
});
