/** Minimal iconv-lite shim for Cloudflare Workers (UTF-8 only classroom API). */
function decoder() {
  return {
    write(buf) {
      return Buffer.from(buf || []).toString("utf8");
    },
    end() {
      return "";
    }
  };
}

function encoder() {
  return {
    write(str) {
      return Buffer.from(String(str ?? ""), "utf8");
    },
    end() {
      return Buffer.alloc(0);
    }
  };
}

module.exports = {
  decode(buffer) {
    if (typeof buffer === "string") return buffer;
    return Buffer.from(buffer || []).toString("utf8");
  },
  encode(content) {
    return Buffer.from(String(content ?? ""), "utf8");
  },
  encodingExists() {
    return true;
  },
  getDecoder() {
    return decoder();
  },
  getEncoder() {
    return encoder();
  },
  decodeStream() {
    throw new Error("iconv-lite decodeStream is not available on Workers");
  },
  encodeStream() {
    throw new Error("iconv-lite encodeStream is not available on Workers");
  }
};
