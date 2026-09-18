/** Minimal stub — Worker never needs iconv encoding tables. */
function asBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(String(input ?? ""), "utf8");
}

module.exports = {
  decode(buf, encoding, options) {
    const b = asBuffer(buf);
    if (options && options.stripBOM && b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
      return b.slice(3).toString("utf8");
    }
    return b.toString(encoding && String(encoding).toLowerCase() === "utf-8" ? "utf8" : "utf8");
  },
  encode(str) {
    return Buffer.from(String(str ?? ""), "utf8");
  },
  encodingExists() {
    return true;
  },
  decodeStream() {
    throw new Error("iconv-lite streams are not available in the Worker stub");
  },
  encodeStream() {
    throw new Error("iconv-lite streams are not available in the Worker stub");
  }
};
