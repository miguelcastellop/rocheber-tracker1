// Netlify Function — proxy hacia Google Apps Script
const https = require("https");
 
exports.handler = async (event) => {
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
 
  if (!APPS_SCRIPT_URL) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: false, error: "APPS_SCRIPT_URL no configurada" })
    };
  }
 
  const params = new URLSearchParams(event.queryStringParameters || {});
  const targetUrl = `${APPS_SCRIPT_URL}?${params.toString()}`;
 
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const body = await httpGet(targetUrl, 0, 25000);
      try { JSON.parse(body); } catch(e) {
        if (intento < 2) continue;
        return { statusCode: 502, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: false, error: "Respuesta no válida de Google" }) };
      }
      return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: body };
    } catch (err) {
      if (intento < 2) continue;
      return { statusCode: 503, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: false, error: "Timeout: " + err.message }) };
    }
  }
};
 
function httpGet(url, redirects, timeout) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Demasiadas redirecciones"));
    const req = https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return resolve(httpGet(res.headers.location, redirects + 1, timeout));
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`Timeout después de ${timeout/1000}s`)); });
    req.on("error", reject);
  });
}
