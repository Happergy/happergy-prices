import { updatePrices } from "./check";
import { isMainModule, runCli } from "./runtime";

async function runForce(): Promise<void> {
  await updatePrices(true);
}

if (isMainModule(import.meta.url)) {
  await runCli("Force", runForce);
}
