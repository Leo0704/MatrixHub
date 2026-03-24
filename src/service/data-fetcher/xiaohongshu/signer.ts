/**
 * 小红书 x-s 签名获取
 * 基于 MediaCrawler 的 playwright_sign.py 实现
 */

import { Page } from 'playwright';
import * as crypto from 'crypto';

// ============= Helper functions from xhs_sign.py =============

// Custom Base64 character table (shuffled order for obfuscation)
const BASE64_CHARS = 'ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5'.split('');

// CRC32 lookup table
const CRC32_TABLE = [
  0, 1996959894, 3993919788, 2567524794, 124634137, 1886057615, 3915621685,
  2657392035, 249268274, 2044508324, 3772115230, 2547177864, 162941995,
  2125561021, 3887607047, 2428444049, 498536548, 1789927666, 4089016648,
  2227061214, 450548861, 1843258603, 4107580753, 2211677639, 325883990,
  1684777152, 4251122042, 2321926636, 335633487, 1661365465, 4195302755,
  2366115317, 997073096, 1281953886, 3579855332, 2724688242, 1006888145,
  1258607687, 3524101629, 2768942443, 901097722, 1119000684, 3686517206,
  2898065728, 853044451, 1172266101, 3705015759, 2882616665, 651767980,
  1373503546, 3369554304, 3218104598, 565507253, 1454621731, 3485111705,
  3099436303, 671266974, 1594198024, 3322730930, 2970347812, 795835527,
  1483230225, 3244367275, 3060149565, 1994146192, 31158534, 2563907772,
  4023717930, 1907459465, 112637215, 2680153253, 3904427059, 2013776290,
  251722036, 2517215374, 3775830040, 2137656763, 141376813, 2439277719,
  3865271297, 1802195444, 476864866, 2238001368, 4066508878, 1812370925,
  453092731, 2181625025, 4111451223, 1706088902, 314042704, 2344532202,
  4240017532, 1658658271, 366619977, 2362670323, 4224994405, 1303535960,
  984961486, 2747007092, 3569037538, 1256170817, 1037604311, 2765210733,
  3554079995, 1131014506, 879679996, 2909243462, 3663771856, 1141124467,
  855842277, 2852801631, 3708648649, 1342533948, 654459306, 3188396048,
  3373015174, 1466479909, 544179635, 3110523913, 3462522015, 1591671054,
  702138776, 2966460450, 3352799412, 1504918807, 783551873, 3082640443,
  3233442989, 3988292384, 2596254646, 62317068, 1957810842, 3939845945,
  2647816111, 81470997, 1943803523, 3814918930, 2489596804, 225274430,
  2053790376, 3826175755, 2466906013, 167816743, 2097651377, 4027552580,
  2265490386, 503444072, 1762050814, 4150417245, 2154129355, 426522225,
  1852507879, 4275313526, 2312317920, 282753626, 1742555852, 4189708143,
  2394877945, 397917763, 1622183637, 3604390888, 2714866558, 953729732,
  1340076626, 3518719985, 2797360999, 1068828381, 1219638859, 3624741850,
  2936675148, 906185462, 1090812512, 3747672003, 2825379669, 829329135,
  1181335161, 3412177804, 3160834842, 628085408, 1382605366, 3423369109,
  3138078467, 570562233, 1426400815, 3317316542, 2998733608, 733239954,
  1555261956, 3268935591, 3050360625, 752459403, 1541320221, 2607071920,
  3965973030, 1969922972, 40735498, 2617837225, 3943577151, 1913087877,
  83908371, 2512341634, 3803740692, 2075208622, 213261112, 2463272603,
  3855990285, 2094854071, 198958881, 2262029012, 4057260610, 1759359992,
  534414190, 2176718541, 4139329115, 1873836001, 414664567, 2282248934,
  4279200368, 1711684554, 285281116, 2405801727, 4167216745, 1634467795,
  376229701, 2685067896, 3608007406, 1308918612, 956543938, 2808555105,
  3495958263, 1231636301, 1047427035, 2932959818, 3654703836, 1088359270,
  936918000, 2847714899, 3736837829, 1202900863, 817233897, 3183342108,
  3401237130, 1404277552, 615818150, 3134207493, 3453421203, 1423857449,
  601450431, 3009837614, 3294710456, 1567103746, 711928724, 3020668471,
  3272380065, 1510334235, 755167117,
];

function mrc(e: string): number {
  // CRC32 variant, used for x9 field in x-s-common
  let o = -1;
  const minLen = Math.min(57, e.length);
  for (let n = 0; n < minLen; n++) {
    o = CRC32_TABLE[(o & 255) ^ e.charCodeAt(n)] ^ unsignedRightShift(o, 8);
  }
  return (o ^ -1) ^ 3988292384;
}

function unsignedRightShift(num: number, bits: number): number {
  const val = num >>> 0;
  return val >> bits;
}

function encode_utf8(s: string): number[] {
  // Encode string to UTF-8 byte list
  const encoded = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  const result: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    result.push(encoded.charCodeAt(i));
  }
  return result;
}

function b64_encode(data: number[]): string {
  const length = data.length;
  const remainder = length % 3;
  const chunks: string[] = [];

  const mainLength = length - remainder;
  for (let i = 0; i < mainLength; i += 16383) {
    const end = Math.min(i + 16383, mainLength);
    chunks.push(encodeChunk(data, i, end));
  }

  if (remainder === 1) {
    const a = data[length - 1];
    chunks.push(BASE64_CHARS[a >> 2] + BASE64_CHARS[(a << 4) & 63] + '==');
  } else if (remainder === 2) {
    const a = (data[length - 2] << 8) + data[length - 1];
    chunks.push(
      BASE64_CHARS[a >> 10] + BASE64_CHARS[(a >> 4) & 63] + BASE64_CHARS[(a << 2) & 63] + '='
    );
  }

  return chunks.join('');
}

function encodeChunk(data: number[], start: number, end: number): string {
  const result: string[] = [];
  for (let i = start; i < end; i += 3) {
    const c = ((data[i] << 16) & 0xff0000) + ((data[i + 1] << 8) & 0xff00) + (data[i + 2] & 0xff);
    result.push(
      BASE64_CHARS[(c >> 18) & 63] +
      BASE64_CHARS[(c >> 12) & 63] +
      BASE64_CHARS[(c >> 6) & 63] +
      BASE64_CHARS[c & 63]
    );
  }
  return result.join('');
}

function get_trace_id(): string {
  // Generate trace id for link tracing
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ============= Signing logic =============

function _build_sign_string(
  uri: string,
  data: Record<string, unknown> | string | null,
  method: string = 'POST'
): string {
  if (method.toUpperCase() === 'POST') {
    let c = uri;
    if (data !== null) {
      if (typeof data === 'object') {
        c += JSON.stringify(data);
      } else {
        c += data;
      }
    }
    return c;
  } else {
    // GET request uses query string format
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return uri;
    }

    if (typeof data === 'object') {
      const params: string[] = [];
      for (const key of Object.keys(data)) {
        let value = data[key];
        if (Array.isArray(value)) {
          value = value.join(',');
        } else if (value !== null && value !== undefined) {
          value = String(value);
        } else {
          value = '';
        }
        // URL encode the value
        value = encodeURIComponent(value);
        params.push(`${key}=${value}`);
      }
      return `${uri}?${params.join('&')}`;
    } else if (typeof data === 'string') {
      return `${uri}?${data}`;
    }
    return uri;
  }
}

function _md5_hex(s: string): string {
  return crypto.createHash('md5').update(s, 'utf-8').digest('hex');
}

function _build_xs_payload(x3_value: string, data_type: string = 'object'): string {
  const s = {
    x0: '4.2.1',
    x1: 'xhs-pc-web',
    x2: 'Mac OS',
    x3: x3_value,
    x4: data_type,
  };
  return 'XYS_' + b64_encode(encode_utf8(JSON.stringify(s)));
}

function _build_xs_common(a1: string, b1: string, x_s: string, x_t: string): string {
  const payload = {
    s0: 3,
    s1: '',
    x0: '1',
    x1: '4.2.2',
    x2: 'Mac OS',
    x3: 'xhs-pc-web',
    x4: '4.74.0',
    x5: a1,
    x6: x_t,
    x7: x_s,
    x8: b1,
    x9: mrc(x_t + x_s + b1),
    x10: 154,
    x11: 'normal',
  };
  return b64_encode(encode_utf8(JSON.stringify(payload)));
}

/**
 * Get b1 value from localStorage
 */
async function get_b1_from_localstorage(page: Page): Promise<string> {
  try {
    const localStorage = await page.evaluate(() => window.localStorage);
    return (localStorage as Record<string, string>).get('b1') || '';
  } catch {
    return '';
  }
}

/**
 * Call window.mnsv2 function via playwright
 */
async function call_mnsv2(page: Page, sign_str: string, md5_str: string): Promise<string> {
  try {
    const result = await page.evaluate(
      (s: string, m: string) => window.mnsv2(s, m),
      sign_str,
      md5_str
    );
    return (result as string) || '';
  } catch {
    return '';
  }
}

/**
 * Generate x-s signature via playwright injection
 */
async function sign_xs_with_playwright(
  page: Page,
  uri: string,
  data: Record<string, unknown> | string | null,
  method: string = 'POST'
): Promise<string> {
  const sign_str = _build_sign_string(uri, data, method);
  const md5_str = _md5_hex(sign_str);
  const x3_value = await call_mnsv2(page, sign_str, md5_str);
  const data_type = typeof data === 'object' ? 'object' : 'string';
  return _build_xs_payload(x3_value, data_type);
}

/**
 * Generate complete signature request headers via playwright
 */
export async function sign_with_playwright(
  page: Page,
  uri: string,
  data: Record<string, unknown> | string | null = null,
  a1: string = '',
  method: string = 'POST'
): Promise<{
  'x-s': string;
  'x-t': string;
  'x-s-common': string;
  'x-b3-traceid': string;
}> {
  const b1 = await get_b1_from_localstorage(page);
  const x_s = await sign_xs_with_playwright(page, uri, data, method);
  const x_t = String(Math.floor(Date.now()));

  return {
    'X-S': x_s,
    'X-T': x_t,
    'X-S-Common': _build_xs_common(a1, b1, x_s, x_t),
    'X-B3-Traceid': get_trace_id(),
  };
}

/**
 * Generate request header signature using playwright injection method
 */
export async function pre_headers_with_playwright(
  page: Page,
  url: string,
  cookie_dict: Record<string, string>,
  params?: Record<string, unknown>,
  payload?: Record<string, unknown>
): Promise<Record<string, string>> {
  const a1_value = cookie_dict['a1'] || '';

  // Parse URL to get path
  const urlObj = new URL(url);
  const uri = urlObj.pathname;

  // Determine request data and method
  let data: Record<string, unknown> | string | null = null;
  let method = 'POST';
  if (params !== undefined) {
    data = params;
    method = 'GET';
  } else if (payload !== undefined) {
    data = payload;
    method = 'POST';
  } else {
    throw new Error('params or payload is required');
  }

  const signs = await sign_with_playwright(page, uri, data, a1_value, method);

  return {
    'X-S': signs['X-S'],
    'X-T': signs['X-T'],
    'X-S-Common': signs['X-S-Common'],
    'X-B3-Traceid': signs['X-B3-Traceid'],
  };
}
