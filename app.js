// ── CONFIGURACIÓN ──
const APPS_SCRIPT_URL = "https://miguelcastellop.github.io/rocheber-tracker1/"; // 👈 PEGAR AQUÍ LA URL DEL WEB APP
 
// ── CACHÉ LOCAL de OPs consultadas en esta sesión ──
// Evita llamar al Sheet cada vez que se rescana la misma OP
const opCache = {};
 
const PIPELINE_STEPS = ["CORTE", "MECANIZADO", "ENSAMBLAJE", "ACRISTALAR", "EXPEDICION"];
const PIPELINE_LABELS = ["Corte", "Mecanizado", "Ensamblaje", "Acristalar", "Expedición"];
 
let currentStation = "";
let currentOperario = "";
let currentOperarioName = "";
let currentOP = null;
let timerInterval = null;
let timerStart = null;
let eventLog = [];
 
// ── SETUP ──
const LS_STATION_KEY = "rocheber_station";
const LS_STATION_NAME_KEY = "rocheber_station_name";
 
function iniciarSesion() {
  const estSelect = document.getElementById("sel-estacion");
  const op = document.getElementById("sel-operario");
  const est = estSelect.value;
  const opVal = op.value;
  if (!est || !opVal) { showToast("Selecciona estación y operario", "error"); return; }
 
  currentStation = est;
  currentOperario = opVal;
  currentOperarioName = op.options[op.selectedIndex].text;
 
  // Guardar estación en localStorage (persiste al cerrar/reabrir)
  localStorage.setItem(LS_STATION_KEY, est);
  localStorage.setItem(LS_STATION_NAME_KEY, formatStation(est));
 
  arrancarApp();
}
 
function arrancarApp() {
  document.getElementById("header-station-name").textContent = formatStation(currentStation);
  document.getElementById("setup-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "flex";
 
  // Si hay una OP pendiente del QR escaneado, cargarla directamente
  if (pendingOP) {
    const opId = pendingOP;
    pendingOP = null;
    setTimeout(() => cargarOP(opId), 150); // pequeño delay para que la app esté visible
  }
}
 
// Cambiar solo el operario (turno nuevo), manteniendo la estación
function cambiarTurno() {
  // Volver al setup pero con la estación ya seleccionada y bloqueada
  cancelarOP();
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("setup-screen").style.display = "flex";
 
  // Pre-seleccionar la estación guardada y deshabilitarla
  const savedStation = localStorage.getItem(LS_STATION_KEY);
  if (savedStation) {
    const sel = document.getElementById("sel-estacion");
    sel.value = savedStation;
    sel.disabled = true;
    mostrarBannerEstacion(savedStation);
  }
  // Limpiar operario para que lo seleccione
  document.getElementById("sel-operario").value = "";
  showToast("Selecciona el operario del nuevo turno", "info");
}
 
// Olvidar la estación guardada (para cambiarla)
function olvidarEstacion() {
  localStorage.removeItem(LS_STATION_KEY);
  localStorage.removeItem(LS_STATION_NAME_KEY);
  document.getElementById("sel-estacion").disabled = false;
  document.getElementById("sel-estacion").value = "";
  document.getElementById("station-remembered").style.display = "none";
}
 
function mostrarBannerEstacion(stationId) {
  const banner = document.getElementById("station-remembered");
  document.getElementById("remembered-station-label").textContent = formatStation(stationId);
  banner.style.display = "block";
}
 
function formatStation(s) {
  const m = {
    CORTE: "✂ Corte de perfil",
    MECANIZADO: "⚙ Mecanizado",
    ENSAMBLAJE_C1: "🔧 Ensamblaje · Celda 1",
    ENSAMBLAJE_C2: "🔧 Ensamblaje · Celda 2",
    ENSAMBLAJE_C3: "🔧 Ensamblaje · Celda 3",
    ENSAMBLAJE_C4: "🔧 Ensamblaje · Celda 4",
    ENSAMBLAJE_C5: "🔧 Ensamblaje · Celda 5",
    ACRISTALAR: "🔲 Acristalar",
    EXPEDICION: "📦 Expedición"
  };
  return m[s] || s;
}
 
// ── CARGAR OP ──
async function cargarOP(opId) {
  if (!opId) { showToast("Introduce un ID de orden", "error"); return; }
  opId = opId.toUpperCase().trim();
 
  if (!APPS_SCRIPT_URL) {
    showToast("⚠️ Configura la URL del Apps Script en app.js", "error");
    return;
  }
 
  if (opCache[opId]) {
    currentOP = opCache[opId];
    renderOP(currentOP);
    return;
  }
 
  mostrarCargando(true);
 
  try {
    const data = await jsonp(APPS_SCRIPT_URL, { action: "getOP", op_id: opId });
 
    mostrarCargando(false);
 
    if (!data.ok) {
      showToast(`Orden ${opId} no encontrada`, "error");
      return;
    }
 
    const op = {
      op_id:         data.orden.op_id        || opId,
      cliente:       data.orden.cliente       || "—",
      referencia:    data.orden.referencia    || "—",
      tipo_ventana:  data.orden.tipo_ventana  || "—",
      alto:          data.orden.alto          || "—",
      ancho:         data.orden.ancho         || "—",
      cantidad:      data.orden.cantidad      || "—",
      fecha_entrega: normalizarFecha(data.orden.fecha_entrega),
      material:      data.orden.material      || "—",
      estado_actual: data.orden.estado_actual || "CORTE",
    };
 
    opCache[opId] = op;
    currentOP = op;
    renderOP(currentOP);
 
  } catch (err) {
    mostrarCargando(false);
    showToast("Error: " + err.message, "error");
    console.error("Error consultando OP:", err);
  }
}
 
// JSONP directo a Google Apps Script — sin proxy, sin CORS
function jsonp(url, params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = "_cb" + Date.now();
    let timer;
 
    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      const el = document.getElementById("_jsonp");
      if (el) el.remove();
    }
 
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout — Google tardó demasiado"));
    }, timeoutMs);
 
    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };
 
    const qs = Object.entries({ ...params, callback: cbName })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
 
    const script = document.createElement("script");
    script.id = "_jsonp";
    script.src = `${url}?${qs}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo conectar con Google Apps Script"));
    };
    document.head.appendChild(script);
  });
}
 
// Normalizar fecha — el Sheet puede devolver ISO o dd/mm/yyyy
function normalizarFecha(fecha) {
  if (!fecha) return "—";
  // Si viene en formato ISO (2026-05-13T22:00:00.000Z)
  if (fecha.includes("T")) {
    const d = new Date(fecha);
    // Sumar un día para compensar el offset de zona horaria
    d.setDate(d.getDate() + 1);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }
  return fecha;
}
 
function mostrarCargando(activo) {
  const loadingMsg = document.getElementById("loading-msg");
  if (loadingMsg) loadingMsg.style.display = activo ? "flex" : "none";
}
 
function renderOP(op) {
  // Header
  document.getElementById("header-op-id").textContent = op.op_id;
  document.getElementById("header-op-id").classList.remove("empty");
 
  // Card
  document.getElementById("card-op-id").textContent = op.op_id;
  document.getElementById("card-cliente").textContent = op.cliente;
  document.getElementById("card-tipo").textContent = op.tipo_ventana;
  document.getElementById("card-dims").textContent = `${op.alto} × ${op.ancho} cm`;
  document.getElementById("card-cantidad").textContent = `${op.cantidad} uds`;
  document.getElementById("card-material").textContent = op.material;
 
  // Fecha entrega + días restantes
  const [d, m, y] = op.fecha_entrega.split("/").map(Number);
  const fechaObj = new Date(y, m-1, d);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const diff = Math.round((fechaObj - hoy) / 86400000);
  document.getElementById("card-fecha").textContent = op.fecha_entrega;
  const diasEl = document.getElementById("card-dias");
  const deliveryEl = document.getElementById("delivery-block");
  if (diff < 0) {
    diasEl.textContent = `${Math.abs(diff)}d retrasado`;
    diasEl.className = "days late";
    deliveryEl.className = "delivery-item urgent";
  } else if (diff <= 2) {
    diasEl.textContent = diff === 0 ? "Hoy" : `${diff}d`;
    diasEl.className = "days warn";
    deliveryEl.className = "delivery-item warning";
  } else {
    diasEl.textContent = `${diff}d`;
    diasEl.className = "days ok";
    deliveryEl.className = "delivery-item";
  }
 
  // Pipeline — muestra dónde está este dispositivo
  renderPipeline();
  ocultarAvisoEstacion();
 
  // Limpiar timer anterior
  clearInterval(timerInterval);
  document.getElementById("timer-block").style.display = "none";
 
  const statusEl   = document.getElementById("card-status");
  const btnIniciar  = document.getElementById("btn-iniciar");
  const btnFinalizar = document.getElementById("btn-finalizar");
 
  // ¿Ya hemos iniciado esta OP en esta estación en esta sesión?
  const yaIniciada = eventLog.find(e =>
    e.op_id === op.op_id && e.estacion === currentStation && e.tipo === "INICIO" &&
    !eventLog.find(f => f.op_id === op.op_id && f.estacion === currentStation && f.tipo === "FIN" && f.ts > e.ts)
  );
 
  if (yaIniciada) {
    // Estaba en curso — restaurar timer
    statusEl.textContent = "En curso";
    statusEl.className = "status-badge en-curso";
    btnIniciar.style.display = "none";
    btnFinalizar.style.display = "block";
    timerStart = yaIniciada.ts;
    startTimer();
  } else {
    // Lista para iniciar — siempre permitido
    statusEl.textContent = "Lista para iniciar";
    statusEl.className = "status-badge pendiente";
    btnIniciar.style.display = "block";
    btnFinalizar.style.display = "none";
  }
 
  document.getElementById("waiting-state").style.display = "none";
  document.getElementById("op-state").style.display = "flex";
  document.getElementById("action-area").style.display = "flex";
}
 
function renderPipeline() {
  const container = document.getElementById("pipeline");
  container.innerHTML = "";
  // La estación activa es siempre la del dispositivo, no el estado de la OP
  const miEstacion = currentStation.startsWith("ENSAMBLAJE") ? "ENSAMBLAJE" : currentStation;
  const activeIdx = PIPELINE_STEPS.indexOf(miEstacion);
 
  PIPELINE_STEPS.forEach((step, i) => {
    const div = document.createElement("div");
    div.className = "pipe-step";
    if (i === activeIdx) div.classList.add("active");
 
    const dot = document.createElement("div");
    dot.className = "pipe-dot";
    const label = document.createElement("span");
    label.className = "pipe-label";
    label.textContent = PIPELINE_LABELS[i];
 
    div.appendChild(dot);
    div.appendChild(label);
    container.appendChild(div);
  });
}
 
// ── REGISTRAR EVENTO ──
function registrarEvento(tipo) {
  if (!currentOP) return;
  const ts = new Date();
  const evento = {
    op_id: currentOP.op_id,
    estacion: currentStation,
    operario_id: currentOperario,
    operario_nombre: currentOperarioName,
    tipo: tipo,
    ts: ts,
    ts_str: formatTimestamp(ts)
  };
  eventLog.push(evento);
 
  // Enviar a Google Sheets (cuando esté configurado)
  enviarASheets(evento);
 
  if (tipo === "INICIO") {
    showToast(`▶ Iniciada ${currentOP.op_id}`, "success");
    timerStart = ts;
    startTimer();
    document.getElementById("btn-iniciar").style.display = "none";
    document.getElementById("btn-finalizar").style.display = "block";
    document.getElementById("card-status").textContent = "En curso";
    document.getElementById("card-status").className = "status-badge en-curso";
  } else {
    clearInterval(timerInterval);
    showToast(`✓ ${currentOP.op_id} finalizada`, "success");
    addToLog(evento);
    setTimeout(() => cancelarOP(), 1500);
  }
}
 
// ── ENVÍO A SHEETS ──
 
async function enviarASheets(evento) {
  if (!APPS_SCRIPT_URL) return; // Modo demo sin conexión
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento)
    });
  } catch(e) {
    console.warn("No se pudo enviar a Sheets:", e);
  }
}
 
// ── TIMER ──
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const el = document.getElementById("timer-display");
    el.textContent = calcularTiempo(timerStart, new Date());
  }, 1000);
}
 
function calcularTiempo(inicio, fin) {
  const secs = Math.floor((fin - inicio) / 1000);
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
 
// ── LOG ──
function addToLog(evento) {
  const list = document.getElementById("log-list");
  const item = document.createElement("div");
  item.className = "log-item";
  const icon = evento.tipo === "INICIO" ? "▶" : "✓";
  item.innerHTML = `
    <span class="log-icon">${icon}</span>
    <div class="log-body">
      <span class="log-op">${evento.op_id}</span>
      <div class="log-detail">${evento.tipo} · ${formatStation(evento.estacion)} · ${evento.operario_nombre}</div>
    </div>
    <span class="log-time">${formatHora(evento.ts)}</span>
  `;
  list.insertBefore(item, list.firstChild);
  if (list.children.length > 5) list.removeChild(list.lastChild);
  document.getElementById("log-section").style.display = "block";
}
 
// ── UI HELPERS ──
function cancelarOP() {
  currentOP = null;
  clearInterval(timerInterval);
  ocultarAvisoEstacion();
  document.getElementById("header-op-id").textContent = "Esperando escaneo...";
  document.getElementById("header-op-id").className = "header-op empty";
  document.getElementById("waiting-state").style.display = "flex";
  document.getElementById("op-state").style.display = "none";
  document.getElementById("action-area").style.display = "none";
  document.getElementById("manual-op-input").value = "";
}
 
// ── ESCÁNER DE CÁMARA ──
let scannerStream = null;
let scannerAnimFrame = null;
let scannerActive = false;
 
async function abrirEscaner() {
  const overlay = document.getElementById("scanner-overlay");
  const video = document.getElementById("scanner-video");
  const status = document.getElementById("scanner-status");
 
  overlay.classList.add("show");
  scannerActive = true;
  status.textContent = "Iniciando cámara...";
 
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = scannerStream;
    await video.play();
    status.textContent = "Buscando código QR...";
    escanearFrame();
  } catch (err) {
    cerrarEscaner();
    mostrarEscaneo(); // muestra el modal de error
    console.error("Error cámara:", err);
  }
}
 
function escanearFrame() {
  if (!scannerActive) return;
  const video = document.getElementById("scanner-video");
  const canvas = document.getElementById("scanner-canvas");
 
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
 
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert"
    });
 
    if (code) {
      // QR detectado — flash visual
      const flash = document.getElementById("scanner-result-flash");
      flash.classList.add("flash");
      setTimeout(() => flash.classList.remove("flash"), 200);
 
      // Extraer el ID de la OP de la URL o del texto directo
      let opId = code.data.trim();
      try {
        const url = new URL(opId);
        opId = url.searchParams.get("op") || opId;
      } catch(e) { /* no es una URL, usar el texto tal cual */ }
 
      cerrarEscaner();
      cargarOP(opId);
      return;
    }
  }
  scannerAnimFrame = requestAnimationFrame(escanearFrame);
}
 
function cerrarEscaner() {
  scannerActive = false;
  cancelAnimationFrame(scannerAnimFrame);
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  document.getElementById("scanner-overlay").classList.remove("show");
}
 
function mostrarEscaneo() {
  document.getElementById("modal-overlay").classList.add("show");
}
 
function mostrarAvisoEstacion(msg) {
  let aviso = document.getElementById("aviso-estacion");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "aviso-estacion";
    aviso.style.cssText = `
      margin: 0 16px;
      background: #2d1515;
      border: 1px solid var(--danger);
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 14px;
      font-weight: 500;
      color: #fca5a5;
      line-height: 1.5;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    `;
    // Insertarlo antes de la op-card
    const opState = document.getElementById("op-state");
    opState.insertBefore(aviso, opState.firstChild);
  }
  aviso.innerHTML = `<span style="font-size:18px;flex-shrink:0">⚠️</span><span>${msg}</span>`;
  aviso.style.display = "flex";
}
 
function ocultarAvisoEstacion() {
  const aviso = document.getElementById("aviso-estacion");
  if (aviso) aviso.style.display = "none";
}
function cerrarModal() {
  document.getElementById("modal-overlay").classList.remove("show");
}
 
let toastTimeout;
function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 3000);
}
 
function formatTimestamp(d) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}
function formatHora(d) {
  return d.toTimeString().slice(0, 5);
}
 
// ── ARRANQUE: recuperar estación guardada + manejar QR entrante ──
let pendingOP = null; // OP escaneada antes de hacer login
 
window.addEventListener("DOMContentLoaded", () => {
  const savedStation = localStorage.getItem(LS_STATION_KEY);
 
  // Capturar OP del QR (puede llegar antes o después del login)
  const params = new URLSearchParams(window.location.search);
  const opParam = params.get("op");
  if (opParam) pendingOP = opParam.toUpperCase().trim();
 
  if (savedStation) {
    // Dispositivo ya configurado → pre-seleccionar estación bloqueada
    const sel = document.getElementById("sel-estacion");
    sel.value = savedStation;
    sel.disabled = true;
    mostrarBannerEstacion(savedStation);
    currentStation = savedStation;
 
    if (pendingOP) {
      // Vino de un QR: indicar al operario qué OP va a procesar
      showToast(`QR detectado: ${pendingOP} — identifícate`, "info");
      // Resaltar el selector de operario
      document.getElementById("sel-operario").focus();
    } else {
      showToast("Estación recordada — selecciona tu nombre", "info");
    }
  } else if (pendingOP) {
    // Primera vez + vino de QR: mostrar aviso
    showToast(`QR detectado: ${pendingOP} — configura la estación`, "info");
  }
});
 
