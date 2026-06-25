function sha256hex(t: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const data = typeof t === "string" ? encoder.encode(t) : t;
  return crypto.subtle.digest("SHA-256", data as any).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

function b64toU8(t: string): Uint8Array {
  const binaryString = atob(t);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function deriveFields(t: string) {
  let e = t;
  for (let r = 0; r < 3; r++) e = await sha256hex(e + r);
  let n = e;
  for (let r = 0; r < 3; r++) n = await sha256hex(n + r);
  return {
    keyField: "kf_" + e.substring(8, 16),
    ivField: "ivf_" + e.substring(16, 24),
    containerName: "cd_" + e.substring(24, 32),
    arrayName: "ad_" + e.substring(32, 40),
    objectName: "od_" + e.substring(40, 48),
    tokenField: e.substring(48, 64) + "_" + e.substring(56, 64),
    keyFrag2Field: n.substring(0, 16) + "_" + n.substring(16, 24),
  };
}

function extractSsrObj(t: string): string {
  const match = t.match(/\{type:"data",data:(\{)/);
  if (!match) throw new Error("SSR data block not found");
  let braceCount = 0;
  const startIndex = t.indexOf("{", match.index! + match[0].length - 1);
  for (let i = startIndex; i < t.length; i++) {
    if (t[i] === "{") braceCount++;
    else if (t[i] === "}" && --braceCount === 0) {
      return t.slice(startIndex, i + 1);
    }
  }
  throw new Error("SSR brace matching failed");
}

function parseJsLiteral(t: string): any {
  let e = 0;
  function ws() {
    while (e < t.length && /\s/.test(t[e])) e++;
  }
  function parseValue(): any {
    ws();
    if (t[e] === "{") return parseObject();
    if (t[e] === "[") return parseArray();
    if (t[e] === '"') return parseDStr();
    if (t[e] === "'") return parseSStr();
    if (t.startsWith("true", e)) return (e += 4), true;
    if (t.startsWith("false", e)) return (e += 5), false;
    if (t.startsWith("null", e)) return (e += 4), null;
    if (t.startsWith("undefined", e)) return (e += 9), null;
    if (t.startsWith("!0", e)) return (e += 2), true;
    if (t.startsWith("!1", e)) return (e += 2), false;
    const match = t.slice(e).match(/^-?[\d.]+([eE][+-]?\d+)?/);
    if (match) return (e += match[0].length), parseFloat(match[0]);
    throw new Error(`JS parse error at pos ${e}: ...${t.slice(e, e + 20)}`);
  }
  function parseDStr() {
    let s = "";
    e++;
    while (e < t.length && t[e] !== '"') {
      if (t[e] === "\\") {
        e++;
        s += ({ n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" } as any)[t[e]] ?? t[e];
        e++;
      } else {
        s += t[e++];
      }
    }
    e++;
    return s;
  }
  function parseSStr() {
    let s = "";
    e++;
    while (e < t.length && t[e] !== "'") {
      if (t[e] === "\\") {
        e++;
        s += t[e] === "'" ? "'" : ({ n: "\n", t: "\t", r: "\r", "\\": "\\" } as any)[t[e]] ?? t[e];
        e++;
      } else {
        s += t[e++];
      }
    }
    e++;
    return s;
  }
  function parseKey() {
    ws();
    if (t[e] === '"') return parseDStr();
    if (t[e] === "'") return parseSStr();
    const match = t.slice(e).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (match) return (e += match[0].length), match[0];
    throw new Error(`Bad key at pos ${e}: ${t.slice(e, e + 20)}`);
  }
  function parseObject() {
    const s: any = {};
    e++;
    ws();
    while (e < t.length && t[e] !== "}") {
      if (t[e] === ",") {
        e++;
        ws();
        continue;
      }
      const key = parseKey();
      ws();
      e++;
      s[key] = parseValue();
      ws();
    }
    e++;
    return s;
  }
  function parseArray() {
    const s: any[] = [];
    e++;
    ws();
    while (e < t.length && t[e] !== "]") {
      if (t[e] === ",") {
        e++;
        ws();
        continue;
      }
      s.push(parseValue());
      ws();
    }
    e++;
    return s;
  }
  return parseValue();
}

function parseWasmDecrypt(e: Uint8Array) {
  let n = 8;
  while (n < e.length) {
    const h = e[n++];
    let g = 0;
    let f = 0;
    let A;
    do {
      A = e[n++];
      g |= (A & 127) << f;
      f += 7;
    } while (A & 128);

    if (h === 10) {
      n++;
      let E = 0;
      let $ = 0;
      let b;
      do {
        b = e[n++];
        E |= (b & 127) << $;
        $ += 7;
      } while (b & 128);
      n += E;
      break;
    }
    n += g;
  }
  let r = 0;
  let a = 0;
  let i;
  do {
    i = e[n++];
    r |= (i & 127) << a;
    a += 7;
  } while (i & 128);
  const o = e.slice(n, n + r);

  function leb(h: Uint8Array, g: number): [number, number] {
    let f = 0;
    let A = 0;
    let E;
    do {
      E = h[g++];
      f |= (E & 127) << A;
      A += 7;
    } while (E & 128);
    return [f, g];
  }

  const c = [32, 2, 32, 5, 106, 45, 0, 0, 115, 33, 6];
  let s = -1;
  eLoop: for (let h = 0; h < o.length - c.length; h++) {
    for (let g = 0; g < c.length; g++) {
      if (o[h + g] !== c[g]) continue eLoop;
    }
    s = h + c.length;
    break;
  }
  if (s < 0) throw new Error("WASM: transform start not found");
  let u = -1;
  let d = 36;
  for (let h = s; h < o.length - 4; h++) {
    if (o[h] === 32 && o[h + 1] === 5 && o[h + 2] === 65) {
      const [g, f] = leb(o, h + 3);
      if (o[f] === 108) {
        u = h;
        d = g;
        break;
      }
    }
  }
  if (u < 0) throw new Error("WASM: keystream not found");
  const p = o.slice(s, u);

  function transform(h: number) {
    let g = h & 255;
    const f: number[] = [];
    let A = 0;
    while (A < p.length) {
      const E = p[A++];
      if (E === 32) {
        const [$, b] = leb(p, A);
        A = b;
        f.push($ === 6 ? g : 0);
      } else if (E === 33) {
        const [$, b] = leb(p, A);
        A = b;
        const L = f.pop()!;
        if ($ === 6) g = L & 255;
      } else if (E === 65) {
        const [$, b] = leb(p, A);
        A = b;
        f.push($);
      } else if (E === 106) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b + $) & 255);
      } else if (E === 107) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b - $ + 256) & 255);
      } else if (E === 113) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b & $) & 255);
      } else if (E === 114) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b | $) & 255);
      } else if (E === 115) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b ^ $) & 255);
      } else if (E === 116) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b << ($ & 7)) & 255);
      } else if (E === 118) {
        const $ = f.pop()!;
        const b = f.pop()!;
        f.push((b >>> ($ & 7)) & 255);
      }
    }
    return g;
  }
  return { step: d, transform };
}

function runDecrypt(
  t: Uint8Array,
  e: Uint8Array,
  n: Uint8Array,
  r: Uint8Array,
  a: number,
): Uint8Array {
  const { step: i, transform: o } = parseWasmDecrypt(t);
  const l = new Uint8Array(e.length);
  for (let c = 0; c < e.length; c++) {
    const s = (e[c] ^ n[c] ^ r[c]) & 255;
    l[c] = o(s) ^ (c * i + a) & 255;
  }
  return l;
}

export async function decryptEmbed(htmlText: string): Promise<{ url: string; subtitles: any[] }> {
  const embedDataStr = extractSsrObj(htmlText);
  const embedData = parseJsLiteral(embedDataStr);
  const seed = embedData.obfuscation_seed;
  if (!seed) throw new Error("obfuscation_seed missing");

  const fields = await deriveFields(seed);
  const ocd = embedData.obfuscated_crypto_data;
  if (!ocd) throw new Error("obfuscated_crypto_data missing");

  const container = ocd[fields.containerName];
  if (!container) throw new Error(`containerName "${fields.containerName}" not in ocd`);

  const arr = container[fields.arrayName];
  if (!arr) throw new Error(`arrayName "${fields.arrayName}" not in container`);

  const obj = arr[0][fields.objectName];
  if (!obj) throw new Error(`objectName "${fields.objectName}" not in arr[0]`);

  const keyBytes = b64toU8(obj[fields.keyField]);
  const ivBytes = b64toU8(obj[fields.ivField]);
  const kf2Field = fields.keyFrag2Field;
  const kf2 = embedData[kf2Field];
  if (!kf2) throw new Error(`kf2 field "${kf2Field}" not in data`);

  const kf2Bytes = b64toU8(kf2);
  const token = embedData[fields.tokenField];
  if (!token) throw new Error(`tokenField "${fields.tokenField}" missing`);

  const tokenUrl = `https://flixcloud.cc/api/m3u8/${token}`;
  const res = await fetch(tokenUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, */*",
      Referer: "https://flixcloud.cc/",
    },
  });

  if (!res.ok) throw new Error(`Token API failed with status ${res.status}`);
  const tokenData = (await res.json()) as any;

  const vidKey = (await sha256hex(token + "vid")).substring(0, 10);
  const keyKey = (await sha256hex(token + "key")).substring(0, 10);

  const vidBytes = b64toU8(tokenData[vidKey]);
  const tBytes = b64toU8(tokenData[keyKey]);

  if (!vidBytes.length || !tBytes.length) {
    throw new Error(`Token fields missing. vidKey="${vidKey}" keyKey="${keyKey}"`);
  }

  const seedInt = parseInt(seed.substring(0, 8), 16);
  const wPayload = b64toU8(embedData.w_payload ?? "");
  if (!wPayload.length) throw new Error("w_payload missing from embed data");

  const pbkdf2KeyBytes = runDecrypt(wPayload, keyBytes, kf2Bytes, tBytes, seedInt);

  const pbkdf2Key = await crypto.subtle.importKey("raw", pbkdf2KeyBytes as any, { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);

  const textEncoder = new TextEncoder();
  const derivedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: textEncoder.encode(seed),
        iterations: 1000,
        hash: "SHA-256",
      },
      pbkdf2Key,
      256,
    ),
  );

  for (let w = 0; w < 32; w++) {
    derivedBits[w] ^= seed.charCodeAt(w % seed.length);
  }

  const aesKeyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", derivedBits));
  const aesKey = await crypto.subtle.importKey("raw", aesKeyBytes, { name: "AES-CBC" }, false, [
    "decrypt",
  ]);

  const decryptedBytes = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes as any }, aesKey, vidBytes as any);

  const textDecoder = new TextDecoder();
  const decryptedUrl = textDecoder.decode(decryptedBytes).trim().replace(/\0+$/, "");
  if (!decryptedUrl.startsWith("http")) {
    throw new Error(`Unexpected decrypted value: ${decryptedUrl.substring(0, 60)}`);
  }

  return {
    url: decryptedUrl,
    subtitles: embedData.subtitles ?? [],
  };
}
