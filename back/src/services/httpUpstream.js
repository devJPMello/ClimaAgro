const axios = require('axios');

/**
 * Cliente HTTP para fontes externas (timeouts, User-Agent).
 */
function createUpstreamAxios({ baseURL, timeoutMs = 20000 }) {
  return axios.create({
    baseURL: baseURL || undefined,
    timeout: timeoutMs,
    headers: {
      'User-Agent': process.env.UPSTREAM_USER_AGENT || 'ClimaAgro/1.0 (+https://github.com/)',
      Accept: '*/*'
    },
    validateStatus: () => true
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retentativas limitadas para 429/5xx ou timeout de rede.
 */
async function axiosWithRetries(client, config, { retries = 2, retryDelayMs = 600 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await client.request(config);
      if (res.status >= 200 && res.status < 300) return res;
      if (res.status === 429 || res.status >= 500) {
        lastErr = Object.assign(new Error(`HTTP ${res.status}`), { response: res });
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      const err = Object.assign(new Error(`HTTP ${res.status}`), { response: res });
      throw err;
    } catch (e) {
      lastErr = e;
      const retryable =
        e.code === 'ECONNABORTED' ||
        e.code === 'ETIMEDOUT' ||
        e.code === 'ECONNRESET' ||
        (e.response && (e.response.status === 429 || e.response.status >= 500));
      if (attempt < retries && retryable) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

module.exports = { createUpstreamAxios, axiosWithRetries };
