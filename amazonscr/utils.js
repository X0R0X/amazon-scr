function formatString(str, arguments) {
    for (let i in arguments) {
        str = str.replace("{" + i + "}", arguments[i])
    }
    return str
}

module.exports.formatString = formatString;