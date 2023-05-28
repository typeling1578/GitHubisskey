export default {
    info(...message) {
        console.info((new Date()).toLocaleString(), "[INFO]", ...message);
    },
    warn(...message) {
        console.warn((new Date()).toLocaleString(), "[WARN]", ...message);
    },
    error(...message) {
        console.error((new Date()).toLocaleString(), "[ERROR]", ...message);
    }
}
