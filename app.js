const form = document.querySelector('#lookup-form');
const input = document.querySelector('#ip-input');
const lookupButton = document.querySelector('#lookup-button');
const consent = document.querySelector('#query-consent');
const formMessage = document.querySelector('#form-message');
const results = document.querySelector('#results');
const scriptDetails = document.querySelector('#script-details');
const scriptCode = document.querySelector('#script-code');
const scriptMessage = document.querySelector('#script-message');

let resultIp = '';
let probeScript = '';

function validIPv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

function validIPv6(value) {
  if (!value.includes(':') || /[\s/?#@%\\]/.test(value)) return false;
  try {
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']') && parsed.pathname === '/';
  } catch {
    return false;
  }
}

function setMessage(message, kind = 'error') {
  formMessage.textContent = message;
  formMessage.className = `form-message ${kind}`;
  formMessage.hidden = !message;
}

function setLoading(loading) {
  lookupButton.disabled = loading;
  lookupButton.querySelector('span:first-child').textContent = loading ? '正在查询…' : '查询网络信息';
  input.disabled = loading;
  consent.disabled = loading;
}

function put(id, value, empty = '数据源未提供') {
  document.getElementById(id).textContent = value || empty;
}

function formatLocation(data) {
  return [data.city, data.region].filter(Boolean).join(' · ') || '未提供城市/区域';
}

function formatASN(value) {
  if (value === undefined || value === null || value === '') return '';
  const asn = String(value);
  return /^AS/i.test(asn) ? asn : `AS${asn}`;
}

function renderResult(data, requestedIp) {
  const connection = data.connection && typeof data.connection === 'object' ? data.connection : {};
  resultIp = typeof data.ip === 'string' && data.ip.length <= 45 ? data.ip : requestedIp;
  put('result-ip', resultIp, requestedIp);
  put('result-location', formatLocation(data), '未提供城市/区域');
  const country = [data.country, data.country_code].filter(Boolean).join(' · ');
  put('result-country', country, '数据源未提供');
  put('result-ip-type', data.type || '地址类型未提供');
  put('result-asn', formatASN(connection.asn), '数据源未提供');
  put('result-org', connection.org, '数据源未提供');
  document.querySelector('#checked-at').textContent = `本次查询 · ${new Date().toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}`;
  document.querySelector('#abuse-link').href = `https://www.abuseipdb.com/check/${encodeURIComponent(requestedIp)}`;
  results.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!consent.checked) {
    setMessage('请先阅读并勾选明确同意框；未勾选时不会向 ipwho.is 发送 IP。');
    consent.focus();
    return;
  }
  const ip = input.value.trim();
  if (!(validIPv4(ip) || validIPv6(ip))) {
    results.hidden = true;
    setMessage('请输入有效的 IPv4 或 IPv6 地址（不含端口、网段或方括号）。');
    input.focus();
    consent.checked = false;
    return;
  }

  results.hidden = true;
  setMessage('');
  setLoading(true);
  consent.checked = false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const endpoint = `https://ipwho.is/${encodeURIComponent(ip)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error('LIMIT');
    if (!response.ok) throw new Error('UPSTREAM');
    if (!data || data.success !== true) {
      if (/limit|quota|rate/i.test(String(data.message || ''))) throw new Error('LIMIT');
      throw new Error('NO_DATA');
    }
    const connection = data.connection && typeof data.connection === 'object' ? data.connection : {};
    if (!data.country && !connection.asn && !connection.org) throw new Error('NO_DATA');
    renderResult(data, ip);
    setMessage('查询完成。网络归属与地理位置为第三方数据库结果，可能有误差。', 'success');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (error.name === 'AbortError') {
      setMessage('查询超时：ipwho.is 暂未响应。该服务可能已收到本次请求；本页不保存查询历史。');
    } else if (error.message === 'LIMIT') {
      setMessage('ipwho.is 免费接口可能已达到域名共享的每日请求限额；请稍后再试。');
    } else if (error.message === 'NO_DATA') {
      setMessage('ipwho.is 没有返回可用网络信息。特殊用途、内网或保留地址可能无法查询；本页不会用猜测值补齐。');
    } else {
      setMessage('查询失败或 ipwho.is 暂不可用。该服务可能已收到本次请求；本页不保存查询历史。');
    }
  } finally {
    window.clearTimeout(timer);
    setLoading(false);
  }
});

document.querySelector('#copy-ip').addEventListener('click', async () => {
  if (!resultIp) return;
  try {
    await navigator.clipboard.writeText(resultIp);
    const button = document.querySelector('#copy-ip');
    button.textContent = '已复制';
    window.setTimeout(() => { button.textContent = '复制 IP'; }, 1400);
  } catch {
    setMessage('浏览器未允许剪贴板访问；请从结果卡片中手动复制 IP。');
  }
});

async function loadProbeScript() {
  if (probeScript) return probeScript;
  scriptMessage.textContent = '正在读取固定测试脚本…';
  try {
    const scriptUrl = new URL('./vps_ai_probe.py', document.baseURI);
    const response = await fetch(scriptUrl, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('script unavailable');
    probeScript = await response.text();
    scriptCode.textContent = probeScript;
    scriptMessage.textContent = '';
    return probeScript;
  } catch {
    scriptMessage.textContent = '脚本载入失败，请使用“下载诊断脚本”链接。';
    throw new Error('script unavailable');
  }
}

scriptDetails.addEventListener('toggle', () => {
  if (scriptDetails.open) loadProbeScript().catch(() => {});
});

document.querySelector('#copy-script').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    const code = await loadProbeScript();
    await navigator.clipboard.writeText(code);
    button.textContent = '已复制代码';
    window.setTimeout(() => { button.textContent = '复制代码'; }, 1600);
  } catch {
    scriptDetails.open = true;
  }
});
