import * as config from "./config.mjs";

import fs from "fs";

const DEFAULT_LOCALE = "en_US";

const locales = {};

for (const locale_filename of fs.readdirSync("./locales")) {
    const locale = locale_filename.replace(/.json$/, "");
    const locale_file = fs.readFileSync(`./locales/${locale_filename}`);
    locales[locale] = JSON.parse(locale_file.toString("utf8"));
}

let target_locale;
if (Object.keys(locales).includes(config.NOTE_LANGUAGE)) {
    target_locale = config.NOTE_LANGUAGE;
} else if (Object.keys(locales).includes(config.NOTE_LANGUAGE.split("_")[0])) {
    target_locale = config.NOTE_LANGUAGE.split("_")[0];
} else {
    target_locale = DEFAULT_LOCALE;
}

const processed_locale = Object.assign(
    Object.assign({}, locales[DEFAULT_LOCALE]),
    locales[target_locale]
);

export default {
    get(id, ...args) {
        let locale_str = processed_locale[id];
        for (const [i, arg] of args.entries()) {
            locale_str = locale_str.replace(new RegExp(`\\{${i}\\}`, "g"), arg);
        }
        return locale_str;
    }
}
