'use strict';
const crypto = require('crypto');

let cachedToken = null;
let cachedTicket = null;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiry) return cachedToken.value;

  const res = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appKey: process.env.DINGTALK_APPKEY,
      appSecret: process.env.DINGTALK_APPSECRET,
    }),
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error('获取 accessToken 失败: ' + JSON.stringify(data));

  cachedToken = { value: data.accessToken, expiry: Date.now() + (data.expireIn - 300) * 1000 };
  return data.accessToken;
}

async function getJsapiTicket(accessToken) {
  if (cachedTicket && Date.now() < cachedTicket.expiry) return cachedTicket.value;

  const res = await fetch('https://api.dingtalk.com/v1.0/oauth2/jsapiTickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': accessToken,
    },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!data.jsapiTicket) throw new Error('获取 jsapiTicket 失败: ' + JSON.stringify(data));

  cachedTicket = { value: data.jsapiTicket, expiry: Date.now() + (data.expireIn - 300) * 1000 };
  return data.jsapiTicket;
}

function calcSignature(ticket, nonce, ts, url) {
  const parsedUrl = new URL(url);
  let decoded = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
  if (parsedUrl.search) decoded += `?${decodeURIComponent(parsedUrl.search.slice(1))}`;
  const plain = `jsapi_ticket=${ticket}&noncestr=${nonce}&timestamp=${ts}&url=${decoded}`;
  return crypto.createHash('sha1').update(plain, 'utf8').digest('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders() };
  }

  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'url 参数缺失' }) };
  }

  const agentId = process.env.DINGTALK_AGENT_ID;
  const corpId = process.env.DINGTALK_CORP_ID;
  if (!agentId || !corpId) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: '缺少环境变量 DINGTALK_AGENT_ID 或 DINGTALK_CORP_ID' }),
    };
  }

  try {
    const accessToken = await getAccessToken();
    const ticket = await getJsapiTicket(accessToken);
    const timeStamp = Date.now();
    const nonceStr = Math.random().toString(36).substring(2, 17);
    const signature = calcSignature(ticket, nonceStr, timeStamp, url);

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        corpId,
        timeStamp,
        nonceStr,
        signature,
        jsApiList: ['DingdocsScript.base.readWriteAll'],
      }),
    };
  } catch (err) {
    console.error('configPermission error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
