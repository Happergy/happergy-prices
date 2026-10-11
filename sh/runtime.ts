import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TIME_ZONE = "Europe/Madrid";
export const DATA_DIR = "data";
export const API_BASE_URL = "https://us-central1-best-price-pvpc.cloudfunctions.net";

export async function fetchText(url: string, context: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${context}: HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export async function fetchTextIfAvailable(url: string, context: string): Promise<string | null> {
  const response = await fetch(url);
  if (response.status === 404) {
    console.log(`[${context}] Data is not available yet`);
    return null;
  }
  if (!response.ok) {
    throw new Error(`${context}: HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export async function saveFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function removeFileIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
    console.log(`🗑️ Clean files: ${path}`);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
}

export function isMainModule(moduleUrl: string): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}

export async function runCli(context: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[${context}]`, error);
    process.exitCode = 1;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
