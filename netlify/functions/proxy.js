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

  try {
    const body = await httpGet(targetUrl);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: body
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};

// GET con seguimiento de redirecciones (Google Apps Script redirige)
function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Demasiadas redirecciones"));

    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      // Seguir redirecciones 301/302
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return resolve(httpGet(res.headers.location, redirects + 1));
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}
