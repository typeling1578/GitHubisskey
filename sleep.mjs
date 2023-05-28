export default function(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
