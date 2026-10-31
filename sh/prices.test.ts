import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fetchGenericPrices } from "./prices";

function response(pvpc: Record<string, unknown>): string {
  return JSON.stringify({
    omie: {},
    pvpc,
    pvpcToday: {},
    pvpcTomorrow: {},
  });
}

describe("generic prices retrieval", () => {
  test("accepts a complete PVPC response without retrying", async () => {
    let calls = 0;
    const prices = await fetchGenericPrices(
      async () => {
        calls += 1;
        return response({ nextPrices: [], devices: [], summary: {} });
      },
      async () => assert.fail("complete responses must not wait"),
    );

    assert.equal(calls, 1);
    assert.deepEqual(prices.pvpc.devices, []);
    assert.deepEqual(prices.pvpc.summary, {});
  });

  test("retries an incomplete PVPC response", async () => {
    let calls = 0;
    const waits: number[] = [];
    const prices = await fetchGenericPrices(
      async () => {
        calls += 1;
        return calls === 1
          ? response({ nextPrices: [] })
          : response({ nextPrices: [], devices: [{ id: "generic1" }], summary: {} });
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    assert.equal(calls, 2);
    assert.deepEqual(waits, [2_000]);
    assert.deepEqual(prices.pvpc.devices, [{ id: "generic1" }]);
  });

  test("does not overwrite files after repeated incomplete responses", async () => {
    let calls = 0;
    await assert.rejects(
      fetchGenericPrices(
        async () => {
          calls += 1;
          return response({ nextPrices: [] });
        },
        async () => {},
      ),
      /without devices or summary after 3 attempts/,
    );
    assert.equal(calls, 3);
  });
});
