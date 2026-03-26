/**
 * SSRF protection: check if URL points to internal network
 */
export function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS or HTTP
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block loopback addresses
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP addresses
    const privateIpPatterns = [
      /^10\./,                       // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,                 // 192.168.0.0/16
      /^169\.254\./,                 // Link-local address (AWS metadata)
      /^0\./,                        // 0.0.0.0/8
    ];

    if (privateIpPatterns.some(pattern => pattern.test(hostname))) {
      return false;
    }

    // Block IPv6 link-local addresses
    if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return false;
    }

    // Block internal domains
    const blockedDomains = ['localhost', 'invalid', 'example.com'];
    if (blockedDomains.includes(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
