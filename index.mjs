import got from "got";
import { TIMEZONE, GITHUB_PERSONAL_ACCESS_TOKEN, MISSKEY_ENDPOINT, MISSKEY_TOKEN } from "./config.mjs";
import log from "./log.mjs";
import sleep from "./sleep.mjs";

process.env.TZ = TIMEZONE ?? process.env.TZ;

const GITHUB_API_ENDPOINT_BASE = "https://api.github.com";
const GITHUB_API_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
};

log.info("Getting user info...")
const GITHUB_ACCOUNT = await (async () => {
    const response = await got(
        `${GITHUB_API_ENDPOINT_BASE}/user`,
        {
            method: "GET",
            headers: GITHUB_API_HEADERS,
        },
    ).json();
    return response["login"];
})();
log.info("GitHub Account:", GITHUB_ACCOUNT);

log.info("Getting user emails...");
const GITHUB_ACCOUNT_EMAILS = await (async () => {
    const response = await got(
        `${GITHUB_API_ENDPOINT_BASE}/user/emails`,
        {
            method: "GET",
            headers: GITHUB_API_HEADERS,
        },
    ).json();
    return response.map(obj => obj.email);
})();
log.info("GitHub Account Emails:", GITHUB_ACCOUNT_EMAILS.join(", "));

log.info("Test accessing user events...");
await got(
    `${GITHUB_API_ENDPOINT_BASE}/users/${GITHUB_ACCOUNT}/events`,
    {
        method: "GET",
        headers: GITHUB_API_HEADERS,
    },
);

log.info("Test accessing Misskey API...");
await got(
    `${MISSKEY_ENDPOINT}/api/meta`,
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            i: MISSKEY_TOKEN,
        }),
    }
);

log.info("Ready 🎉");

let oldDate = null;
while (true) {
    const nowDate = new Date();
    if (oldDate &&
        oldDate.getTime() < nowDate.getTime() &&
        oldDate.getDate() != nowDate.getDate()
    ) {
        log.info("The date has changed.");

        const todayDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

        try {
            let yesterdayCommits = [];
            let commitCountPerRepository = {};
            let page = 1;
            while (true) {
                log.info("Getting user events...");
                const response = await got(
                    `${GITHUB_API_ENDPOINT_BASE}/users/${GITHUB_ACCOUNT}/events?page=${page}`,
                    {
                        method: "GET",
                        headers: GITHUB_API_HEADERS,
                        retry: {
                            limit: 5,
                            calculateDelay: ({computedValue}) => {
                                if (computedValue !== 0) {
                                    log.warn(`Failed to create notes to Misskey, retry after ${computedValue / 1000} second(s)...`);
                                }
                                return computedValue;
                            },
                        },
                    },
                ).json();
                for (let event of response) {
                    if (event["type"] != "PushEvent") continue;
                    if (!event["public"]) continue;
                    if (
                        (todayDate.getTime() -
                        (new Date(event["created_at"])).getTime()) > 86400000 /*24 hours*/
                    ) continue;

                    const commits = event["payload"]["commits"].filter(commit => GITHUB_ACCOUNT_EMAILS.includes(commit["author"]["email"]));
                    for (const commit of commits) {
                        log.info(
`Commit found
[${event["repo"]["name"]}:${event["payload"]["ref"]}]
commit ${commit["sha"]}

    ${commit["message"].replaceAll("\n", "\n    ")}
`
                        );
                        yesterdayCommits.push(commit);
                        if (!commitCountPerRepository[event["repo"]["name"]]) {
                            commitCountPerRepository[event["repo"]["name"]] = 0;
                        }
                        commitCountPerRepository[event["repo"]["name"]]++;
                    }
                }
                if (
                    (todayDate.getTime() -
                    (new Date(response.slice(-1)[0]["created_at"])).getTime()) > 86400000 /*24 hours*/
                ) break;
                page++;
            }

            log.info("Notes to Misskey...");
            await got(`${MISSKEY_ENDPOINT}/api/notes/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    i: MISSKEY_TOKEN,
                    text:
`昨日はGitHubに ${yesterdayCommits.length} 回コミットしました。

内訳
${Object.keys(commitCountPerRepository).map(key => `${key}: ${commitCountPerRepository[key]}`).join("\n")}

https://github.com/${GITHUB_ACCOUNT}
`,
                    visibility: "home",
                }),
                retry: {
                    limit: 5,
                    methods: ["POST"],
                    calculateDelay: ({computedValue}) => {
                        if (computedValue !== 0) {
                            log.warn(`Failed to create notes to Misskey, retry after ${computedValue / 1000} second(s)...`);
                        }
                        return computedValue;
                    },
                },
            });
        } catch (e) {
            console.error(e);
        }
    }
    oldDate = nowDate;
    await sleep(1000);
}
