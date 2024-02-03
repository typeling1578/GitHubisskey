import * as config from "./config.mjs";

import log from "./log.mjs";
import sleep from "./sleep.mjs";

import got from "got";

const GITHUB_API_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.GITHUB_PERSONAL_ACCESS_TOKEN}`,
};

log.info("Getting user info...");
const github_user = await got(
    "https://api.github.com/user",
    {
        method: "GET",
        headers: GITHUB_API_HEADERS,
    },
).json();

log.info("GitHub User:", github_user.login);

log.info("Getting user emails...");
const github_user_emails = await got(
    "https://api.github.com/user/emails",
    {
        method: "GET",
        headers: GITHUB_API_HEADERS,
    },
).json();

log.info(
    "GitHub User Emails:",
    github_user_emails.map(email_info => email_info.email).join(", ")
);

log.info("Test accessing user events...");
await got(
    `https://api.github.com/users/${github_user.login}/events`,
    {
        method: "GET",
        headers: GITHUB_API_HEADERS,
    },
);

log.info("Test accessing Misskey API...");
await got(
    `${config.MISSKEY_ENDPOINT}/api/meta`,
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            i: config.MISSKEY_TOKEN,
        }),
    }
);

log.info("Ready 🎉");
log.info("Waiting for the date to change...");

let old_datetime = null;
while (true) {
    const now_datetime = new Date();
    if (
        old_datetime &&
        old_datetime.getTime() < now_datetime.getTime() &&
        old_datetime.getDate() !== now_datetime.getDate()
    ) {
        log.info("The date has changed.");

        const today_date = new Date(now_datetime.getFullYear(), now_datetime.getMonth(), now_datetime.getDate());

        try {
            const yesterday_commits = [];
            const commit_count_per_repository = {};
            let page = 1;
            while (true) {
                log.info(`Getting user events... (page: ${page})`);
                const events = await got(
                    `https://api.github.com/users/${github_user.login}/events?page=${page}`,
                    {
                        method: "GET",
                        headers: GITHUB_API_HEADERS,
                        retry: {
                            limit: 5,
                            calculateDelay: ({computedValue}) => {
                                if (computedValue !== 0) {
                                    log.warn(`Failed to get user events, retry after ${computedValue / 1000} second(s)...`);
                                }
                                return computedValue;
                            },
                        },
                    }
                ).json();
                for (const event of events) {
                    if (event.type !== "PushEvent") continue;
                    if (config.IGNORE_REPOS.includes(event.repo.name)) continue;
                    if (!event.public) continue;
                    if ((today_date.getTime() - (new Date(event.created_at)).getTime()) > 86400000 /*24 hours*/)
                        continue;

                    const commits = event.payload.commits.filter(commit =>
                        github_user_emails.map(email_info => email_info.email)
                            .includes(commit.author.email)
                    );
                    for (const commit of commits) {
                        log.info(
`Commit found
[${event.repo.name}:${event.payload.ref}]
commit ${commit.sha}

    ${commit.message.replaceAll("\n", "\n    ")}
`
                        );
                        yesterday_commits.push(commit);
                        if (!commit_count_per_repository[event.repo.name]) {
                            commit_count_per_repository[event.repo.name] = 0;
                        }
                        commit_count_per_repository[event.repo.name]++;
                    }
                }
                if ((today_date.getTime() - (new Date(events.slice(-1)[0].created_at)).getTime()) > 86400000 /*24 hours*/)
                    break;
                page++;
            }

            log.info("Notes to Misskey...");
            await got(`${config.MISSKEY_ENDPOINT}/api/notes/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    i: config.MISSKEY_TOKEN,
                    text:
`昨日はGitHubに ${yesterday_commits.length} 回コミットしました。

内訳
${Object.keys(commit_count_per_repository).map(key => `${key}: ${commit_count_per_repository[key]}`).join("\n")}

https://github.com/${github_user.login}
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
    old_datetime = now_datetime;
    await sleep(1000);
}
