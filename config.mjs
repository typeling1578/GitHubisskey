(await import("dotenv")).config();

export const TIMEZONE = process.env.TZ ?? "UTC";
export const IGNORE_REPOS = (process.env.IGNORE_REPOS ?? "").split(":");
export const GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
export const MISSKEY_ENDPOINT = process.env.MISSKEY_ENDPOINT;
export const MISSKEY_TOKEN = process.env.MISSKEY_TOKEN;
