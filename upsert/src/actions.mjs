import { appendFileSync, readFileSync } from "node:fs";

const escape = (text) => text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

export const input = (name) => process.env[`INPUT_${name.toUpperCase()}`] ?? "";

export const boolean = (name) => {
  const value = input(name).trim().toLowerCase();
  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no", ""].includes(value)) return false;
  throw new Error(`${name} must be true or false, got "${input(name)}"`);
};

// Digits only, before `Number`: it also reads `0x2a` and `1e21`, and rounds
// anything past 2^53 to a *different* number that still looks like an integer.
export const positiveInteger = (text) =>
  /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0
    ? Number(text)
    : null;

export const choice = (name, allowed, supported = allowed) => {
  const value = input(name).trim() || allowed[0];
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${value}"`);
  }
  if (!supported.includes(value)) {
    throw new Error(`${name}: "${value}" is not supported yet`);
  }
  return value;
};

export const notice = (message) => console.log(`::notice::${escape(message)}`);

export const fail = (error) => {
  console.log(`::error::${escape(error?.message ?? String(error))}`);
  process.exit(1);
};

export const setOutput = (name, value) => {
  const file = process.env["GITHUB_OUTPUT"];
  if (!file) return;
  appendFileSync(file, `${name}=${value}\n`);
};

export const event = () => {
  const path = process.env["GITHUB_EVENT_PATH"];
  if (!path) return {};
  return JSON.parse(readFileSync(path, "utf8"));
};
