const STORAGE_KEY = "ziraat-filo-finans-v1";

const creditTypes = {
  annuity: "Eşit Taksitli",
  equalPrincipal: "Eşit Anapara",
  bch: "BCH",
  balloon: "Balon Ödemeli",
  tlref: "Özel Plan / TLREF",
};

const bchSubTypes = {
  annuity: "Eşit taksitli",
  equalPrincipal: "Eşit anapara",
  interestOnly: "Sadece faiz ödemeli",
  endPayment: "Dönem sonu kapamalı",
};

const roles = {
  admin: "Yönetici",
  finance: "Finans Kullanıcısı",
  accounting: "Muhasebe Kullanıcısı",
  report: "Rapor Kullanıcısı",
};

let state = loadState();
let page = state.session ? "dashboard" : "login";

function seedState() {
  const credits = [
    {
      id: uid(),
      bankName: "Ziraat Bankası",
      creditType: "annuity",
      subType: "",
      disbursementDate: "2026-01-15",
      firstPaymentDate: "2026-02-15",
      paymentDay: 15,
      maturity: 24,
      principal: 8200000,
      bsmvRate: 15,
      fixedRate: 3.1,
      balloonAmount: 0,
      balloonRatio: 0,
      status: "active",
      tlrefPeriods: [],
      createdAt: today(),
    },
    {
      id: uid(),
      bankName: "Ziraat Katılım",
      creditType: "tlref",
      subType: "",
      disbursementDate: "2026-03-01",
      firstPaymentDate: "2026-04-01",
      paymentDay: 1,
      maturity: 12,
      principal: 3600000,
      bsmvRate: 15,
      fixedRate: 0,
      balloonAmount: 0,
      balloonRatio: 0,
      status: "active",
      tlrefPeriods: [
        { periodNo: 1, tlrefRate: 3.7, bankCommissionRate: 0.45 },
        { periodNo: 2, tlrefRate: 3.8, bankCommissionRate: 0.45 },
        { periodNo: 3, tlrefRate: 3.85, bankCommissionRate: 0.45 },
      ],
      createdAt: today(),
    },
  ];
  const vehicles = [
    { id: uid(), chassisNo: "NM0EXXTTREPG10021", brand: "Ford", model: "Transit", purchaseDate: "2026-01-12", purchasePrice: 1850000, plateNo: "34 FLE 101", description: "Dağıtım filosu", createdAt: today() },
    { id: uid(), chassisNo: "WVWZZZCDZPW225901", brand: "Volkswagen", model: "Caddy", purchaseDate: "2026-01-18", purchasePrice: 1420000, plateNo: "34 FLE 102", description: "Saha ekibi", createdAt: today() },
    { id: uid(), chassisNo: "VF1RFB00670128455", brand: "Renault", model: "Master", purchaseDate: "2026-03-04", purchasePrice: 2100000, plateNo: "34 FLE 201", description: "Lojistik", createdAt: today() },
  ];
  const allocations = [
    { id: uid(), creditId: credits[0].id, vehicleId: vehicles[0].id, financedAmount: 4100000, allocationStartDate: "2026-01-15", isActive: true, createdAt: today() },
    { id: uid(), creditId: credits[0].id, vehicleId: vehicles[1].id, financedAmount: 4100000, allocationStartDate: "2026-01-15", isActive: true, createdAt: today() },
    { id: uid(), creditId: credits[1].id, vehicleId: vehicles[2].id, financedAmount: 3600000, allocationStartDate: "2026-03-01", isActive: true, createdAt: today() },
  ];
  return {
    session: null,
    users: [{ id: uid(), name: "Finans Yöneticisi", email: "finans@ziraatfilo.local", role: "admin", isActive: true, createdAt: today() }],
    vehicles,
    credits,
    allocations,
    auditLogs: [],
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return seedState();
  try {
    return { ...seedState(), ...JSON.parse(saved) };
  } catch {
    return seedState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function dateISO(date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date, months, paymentDay) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(Number(paymentDay), lastDay));
  return next;
}

function dayDiff(start, end) {
  return Math.max(1, Math.round((parseDate(end) - parseDate(start)) / 86400000));
}

function money(value) {
  return Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
}

function pct(value) {
  return `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}%`;
}

function number(value) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function monthlyRate(credit, periodNo) {
  if (credit.creditType === "tlref") {
    const row = credit.tlrefPeriods.find((p) => Number(p.periodNo) === Number(periodNo));
    if (!row) return null;
    return (Number(row.tlrefRate || 0) + Number(row.bankCommissionRate || 0)) / 100;
  }
  return Number(credit.fixedRate || 0) / 100;
}

function generateInstallments(credit) {
  const errors = validateCredit(credit, true);
  if (errors.length) return [];

  const rows = [];
  let opening = Number(credit.principal);
  const bsmvRate = Number(credit.bsmvRate) / 100;
  const maturity = Number(credit.maturity);
  let periodStart = credit.disbursementDate;
  let dueDate = credit.firstPaymentDate;
  const type = credit.creditType === "bch" ? credit.subType : credit.creditType;
  const baseRate = monthlyRate(credit, 1) || 0;
  const annuityPayment = baseRate > 0
    ? opening * (baseRate * Math.pow(1 + baseRate, maturity)) / (Math.pow(1 + baseRate, maturity) - 1)
    : opening / maturity;
  const balloonValue = Number(credit.balloonAmount || 0) || Number(credit.principal) * Number(credit.balloonRatio || 0) / 100;
  const amortizedForBalloon = Math.max(0, Number(credit.principal) - balloonValue);

  for (let i = 1; i <= maturity; i += 1) {
    const rate = monthlyRate(credit, i);
    if (rate === null) break;
    const days = dayDiff(periodStart, dueDate);
    let principalAmount = 0;
    const interestAmount = opening * rate;

    if (type === "annuity") {
      principalAmount = Math.min(opening, Math.max(0, annuityPayment - interestAmount));
    } else if (type === "equalPrincipal") {
      principalAmount = Math.min(opening, Number(credit.principal) / maturity);
    } else if (type === "interestOnly") {
      principalAmount = i === maturity ? opening : 0;
    } else if (type === "endPayment") {
      principalAmount = i === maturity ? opening : 0;
    } else if (type === "balloon") {
      const regular = maturity > 1 ? amortizedForBalloon / (maturity - 1) : 0;
      principalAmount = i === maturity ? opening : Math.min(opening, regular);
    } else if (type === "tlref") {
      principalAmount = Math.min(opening, Number(credit.principal) / maturity);
    }

    const bsmvAmount = interestAmount * bsmvRate;
    const totalPayment = principalAmount + interestAmount + bsmvAmount;
    const closing = Math.max(0, opening - principalAmount);
    rows.push({
      periodNo: i,
      periodStart,
      periodEnd: dueDate,
      dueDate,
      openingPrincipal: opening,
      principalAmount,
      interestAmount,
      bsmvAmount,
      totalPayment,
      closingPrincipal: closing,
      periodDayCount: days,
      dailyFinanceCost: (interestAmount + bsmvAmount) / days,
    });
    opening = closing;
    periodStart = dueDate;
    dueDate = dateISO(addMonths(parseDate(credit.firstPaymentDate), i, credit.paymentDay));
  }
  return rows;
}

function validateCredit(credit, silent = false) {
  const errors = [];
  if (!credit.bankName) errors.push("Banka adı zorunludur.");
  if (!credit.creditType) errors.push("Kredi türü zorunludur.");
  if (!credit.disbursementDate) errors.push("Kredi kullanım tarihi zorunludur.");
  if (!credit.firstPaymentDate) errors.push("İlk ödeme tarihi zorunludur.");
  if (credit.disbursementDate && credit.firstPaymentDate && parseDate(credit.firstPaymentDate) <= parseDate(credit.disbursementDate)) errors.push("İlk ödeme tarihi kredi kullanım tarihinden sonra olmalıdır.");
  if (!credit.paymentDay || Number(credit.paymentDay) < 1 || Number(credit.paymentDay) > 31) errors.push("Aylık ödeme günü 1 ile 31 arasında olmalıdır.");
  if (!credit.maturity || Number(credit.maturity) <= 0) errors.push("Vade zorunludur.");
  if (!credit.principal || Number(credit.principal) <= 0) errors.push("Kredi tutarı pozitif olmalıdır.");
  if (credit.bsmvRate === "" || Number(credit.bsmvRate) < 0) errors.push("BSMV oranı boş bırakılamaz.");
  if (["annuity", "equalPrincipal", "bch", "balloon"].includes(credit.creditType) && Number(credit.fixedRate || 0) < 0) errors.push("Faiz oranı negatif olamaz.");
  if (credit.creditType === "tlref" && !silent && (!credit.tlrefPeriods || credit.tlrefPeriods.length === 0)) errors.push("TLREF kredi için en az bir dönem oranı girilmelidir.");
  return errors;
}

function allocationWeight(allocation) {
  const related = state.allocations.filter((a) => a.creditId === allocation.creditId && a.isActive);
  const total = related.reduce((sum, a) => sum + Number(a.financedAmount || 0), 0);
  return total > 0 ? Number(allocation.financedAmount || 0) / total : 0;
}

function financeCostUntil(credit, untilDate) {
  const rows = generateInstallments(credit);
  const target = parseDate(untilDate);
  return rows.reduce((sum, row) => {
    const start = parseDate(row.periodStart);
    const end = parseDate(row.periodEnd);
    if (target <= start) return sum;
    const elapsed = target >= end ? row.periodDayCount : Math.max(0, Math.round((target - start) / 86400000));
    return sum + row.dailyFinanceCost * Math.min(elapsed, row.periodDayCount);
  }, 0);
}

function vehicleCost(vehicle, untilDate) {
  const allocations = state.allocations.filter((a) => a.vehicleId === vehicle.id && a.isActive && parseDate(a.allocationStartDate) <= parseDate(untilDate));
  const financeCost = allocations.reduce((sum, allocation) => {
    const credit = state.credits.find((c) => c.id === allocation.creditId);
    if (!credit) return sum;
    return sum + financeCostUntil(credit, untilDate) * allocationWeight(allocation);
  }, 0);
  return {
    purchasePrice: Number(vehicle.purchasePrice || 0),
    financeCost,
    currentCost: Number(vehicle.purchasePrice || 0) + financeCost,
  };
}

function canEdit() {
  return state.session && ["admin", "finance"].includes(state.session.role);
}

function render() {
  const app = document.querySelector("#app");
  if (!state.session) {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">ZF</div>
          <div>
            <div class="brand-title">Ziraat Filo Finans</div>
            <div class="brand-subtitle">Araç finansman sistemi</div>
          </div>
        </div>
        <nav class="nav">
          ${navButton("dashboard", "⌂", "Dashboard")}
          ${navButton("credits", "₺", "Krediler")}
          ${navButton("vehicles", "□", "Araçlar")}
          ${navButton("allocations", "⇄", "Eşleştirme")}
          ${navButton("costs", "◷", "Maliyet")}
          ${navButton("reports", "▤", "Raporlar")}
          ${navButton("users", "◉", "Yetki")}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1>${pageTitle()}</h1>
            <div class="hint">${roles[state.session.role]} olarak işlem yapıyorsunuz.</div>
          </div>
          <div class="user-pill">
            <div class="avatar">${state.session.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
            <div>
              <strong>${state.session.name}</strong>
              <div class="small">${state.session.email}</div>
            </div>
            <button class="btn ghost" data-action="logout">Çıkış</button>
          </div>
        </header>
        <section class="content">${renderPage()}</section>
      </main>
    </div>`;
  bindShell();
}

function navButton(id, icon, label) {
  return `<button class="${page === id ? "active" : ""}" data-page="${id}"><span>${icon}</span>${label}</button>`;
}

function pageTitle() {
  return {
    dashboard: "Dashboard",
    credits: "Kredi Yönetimi",
    vehicles: "Araç Yönetimi",
    allocations: "Kredi-Araç Eşleştirme",
    costs: "Tarih Bazlı Maliyet",
    reports: "Raporlar",
    users: "Giriş ve Yetki Yönetimi",
  }[page] || "Dashboard";
}

function renderLogin() {
  return `
    <div class="login-page">
      <form class="login-card" id="loginForm">
        <div class="login-logo">ZF</div>
        <h1>Ziraat Filo Finans</h1>
        <p class="hint">İç kullanım demo uygulaması. PDF kapsamındaki MVP akışları yerel tarayıcıda çalışır.</p>
        <div class="form">
          <div class="field full">
            <label>E-posta</label>
            <input name="email" value="finans@ziraatfilo.local" autocomplete="username" />
          </div>
          <div class="field full">
            <label>Rol</label>
            <select name="role">
              ${Object.entries(roles).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
            </select>
          </div>
          <div class="field full">
            <label>Şifre</label>
            <input name="password" type="password" value="demo" autocomplete="current-password" />
          </div>
        </div>
        <div class="actions"><button class="btn primary">Giriş yap</button></div>
      </form>
    </div>`;
}

function renderPage() {
  if (page === "dashboard") return renderDashboard();
  if (page === "credits") return renderCredits();
  if (page === "vehicles") return renderVehicles();
  if (page === "allocations") return renderAllocations();
  if (page === "costs") return renderCosts();
  if (page === "reports") return renderReports();
  if (page === "users") return renderUsers();
  return renderDashboard();
}

function renderDashboard() {
  const activeCredits = state.credits.filter((c) => c.status === "active");
  const activePrincipal = activeCredits.reduce((s, c) => s + Number(c.principal || 0), 0);
  const vehicleValue = state.vehicles.reduce((s, v) => s + Number(v.purchasePrice || 0), 0);
  const currentTotal = state.vehicles.reduce((s, v) => s + vehicleCost(v, today()).currentCost, 0);
  const monthInterest = activeCredits.reduce((s, c) => s + generateInstallments(c).filter((r) => r.dueDate.slice(0, 7) === today().slice(0, 7)).reduce((x, r) => x + r.interestAmount, 0), 0);
  const monthBsmv = activeCredits.reduce((s, c) => s + generateInstallments(c).filter((r) => r.dueDate.slice(0, 7) === today().slice(0, 7)).reduce((x, r) => x + r.bsmvAmount, 0), 0);
  const byBank = groupBy(activeCredits, "bankName", "principal");
  const maxBank = Math.max(1, ...byBank.map((x) => x.value));
  const upcoming = activeCredits.flatMap((c) => generateInstallments(c).map((r) => ({ ...r, bankName: c.bankName, creditType: creditTypes[c.creditType] })))
    .filter((r) => parseDate(r.dueDate) >= parseDate(today()))
    .sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate))
    .slice(0, 6);
  return `
    <div class="kpi-grid">
      ${kpi("Toplam aktif kredi", money(activePrincipal), `${activeCredits.length} aktif kredi`)}
      ${kpi("Aylık faiz yükü", money(monthInterest), "Bu ay vadesi gelen")}
      ${kpi("Aylık BSMV yükü", money(monthBsmv), "Faiz üzerinden hesaplandı")}
      ${kpi("Finansman dahil araç maliyeti", money(currentTotal), `${state.vehicles.length} araç`)}
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="panel">
        <h2>Banka Bazlı Kredi Dağılımı</h2>
        ${byBank.map((row) => `
          <div class="bar-row">
            <strong>${row.name}</strong>
            <div class="bar-track"><div class="bar" style="width:${Math.max(4, row.value / maxBank * 100)}%"></div></div>
            <span>${money(row.value)}</span>
          </div>`).join("") || `<div class="empty">Kredi yok</div>`}
      </div>
      <div class="panel">
        <h2>Yaklaşan Ödemeler</h2>
        ${table(["Tarih", "Banka", "Tip", "Anapara", "Faiz", "BSMV", "Toplam"], upcoming.map((r) => [r.dueDate, r.bankName, r.creditType, money(r.principalAmount), money(r.interestAmount), money(r.bsmvAmount), money(r.totalPayment)]))}
      </div>
    </div>
    <div class="grid cols-3" style="margin-top:16px">
      ${kpi("Toplam araç alış değeri", money(vehicleValue), "Ana kart alış fiyatı")}
      ${kpi("Birikmiş finansman yükü", money(currentTotal - vehicleValue), "Faiz + BSMV dağıtımı")}
      ${kpi("Aktif eşleştirme", state.allocations.filter((a) => a.isActive).length, "Kredi-araç bağlantısı")}
    </div>`;
}

function kpi(label, value, trend) {
  return `<div class="panel kpi"><label>${label}</label><strong>${value}</strong><div class="trend">${trend}</div></div>`;
}

function renderCredits() {
  return `
    <div class="grid cols-2">
      <div class="panel">
        <h2>Yeni Kredi Oluştur</h2>
        ${!canEdit() ? `<div class="notice">Rolünüz kayıt değiştirme yetkisine sahip değil.</div>` : creditForm()}
      </div>
      <div class="panel">
        <div class="toolbar">
          <h2>Krediler</h2>
          <button class="btn ghost" data-export="credits">CSV dışa aktar</button>
        </div>
        ${creditTable()}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h2>Seçili Kredi Ödeme Planı</h2>
      ${installmentPreview()}
    </div>`;
}

function creditForm() {
  return `
    <form id="creditForm" class="form">
      <div class="field"><label>Banka</label><input name="bankName" value="Ziraat Bankası" required /></div>
      <div class="field"><label>Kredi türü</label><select name="creditType" id="creditType">${Object.entries(creditTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label>BCH alt model</label><select name="subType">${Object.entries(bchSubTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label>Kredi tutarı</label><input name="principal" type="number" min="0" value="1000000" /></div>
      <div class="field"><label>Kullanım tarihi</label><input name="disbursementDate" type="date" value="${today()}" /></div>
      <div class="field"><label>İlk ödeme tarihi</label><input name="firstPaymentDate" type="date" value="${dateISO(addMonths(parseDate(today()), 1, parseDate(today()).getDate()))}" /></div>
      <div class="field"><label>Aylık ödeme günü</label><input name="paymentDay" type="number" min="1" max="31" value="15" /></div>
      <div class="field"><label>Vade ay sayısı</label><input name="maturity" type="number" min="1" value="12" /></div>
      <div class="field"><label>Aylık faiz oranı (%)</label><input name="fixedRate" type="number" step="0.01" min="0" value="3.25" /></div>
      <div class="field"><label>BSMV oranı (%)</label><input name="bsmvRate" type="number" step="0.01" min="0" value="15" /></div>
      <div class="field"><label>Balon ödeme tutarı</label><input name="balloonAmount" type="number" min="0" value="0" /></div>
      <div class="field"><label>Balon oranı (%)</label><input name="balloonRatio" type="number" step="0.01" min="0" value="0" /></div>
      <div class="field full"><label>TLREF dönemleri</label><textarea name="tlrefText" placeholder="1,3.70,0.45&#10;2,3.80,0.45"></textarea><div class="hint">Satır formatı: dönem no, TLREF oranı, banka komisyonu</div></div>
      <div class="actions full">
        <button class="btn primary">Kredi oluştur ve plan üret</button>
      </div>
    </form>`;
}

function creditTable() {
  const rows = state.credits.map((c) => [
    c.bankName,
    creditTypes[c.creditType],
    c.creditType === "bch" ? bchSubTypes[c.subType] : "-",
    c.disbursementDate,
    `${c.maturity} ay`,
    money(c.principal),
    pct(c.bsmvRate),
    `<span class="status ${c.status === "closed" ? "closed" : ""}">${c.status === "closed" ? "Kapalı" : "Aktif"}</span>`,
    `<button class="btn ghost" data-select-credit="${c.id}">Plan</button> ${canEdit() ? `<button class="btn danger" data-close-credit="${c.id}">Kapat</button>` : ""}`,
  ]);
  return table(["Banka", "Tip", "Alt model", "Kullanım", "Vade", "Tutar", "BSMV", "Durum", "İşlem"], rows);
}

function installmentPreview() {
  const credit = state.credits.find((c) => c.id === state.selectedCreditId) || state.credits[0];
  if (!credit) return `<div class="empty">Plan görüntülemek için kredi oluşturun.</div>`;
  const rows = generateInstallments(credit);
  return `
    <div class="split" style="margin-bottom:10px">
      <div><strong>${credit.bankName}</strong> · ${creditTypes[credit.creditType]} · ${money(credit.principal)}</div>
      <button class="btn ghost" data-export-installments="${credit.id}">Plan CSV</button>
    </div>
    ${rows.length ? table(["Dönem", "Başlangıç", "Bitiş", "Kalan", "Anapara", "Faiz", "BSMV", "Toplam", "Günlük yük"], rows.map((r) => [r.periodNo, r.periodStart, r.periodEnd, money(r.openingPrincipal), money(r.principalAmount), money(r.interestAmount), money(r.bsmvAmount), money(r.totalPayment), money(r.dailyFinanceCost)])) : `<div class="notice">Plan üretilemedi. TLREF dönem oranlarını veya zorunlu alanları kontrol edin.</div>`}`;
}

function renderVehicles() {
  return `
    <div class="grid cols-2">
      <div class="panel">
        <h2>Araç Ana Kartı</h2>
        ${!canEdit() ? `<div class="notice">Rolünüz kayıt değiştirme yetkisine sahip değil.</div>` : vehicleForm()}
      </div>
      <div class="panel">
        <div class="toolbar">
          <input id="vehicleSearch" placeholder="Şasi, marka, model ara" value="${state.vehicleSearch || ""}" />
          <button class="btn ghost" data-export="vehicles">CSV dışa aktar</button>
        </div>
        ${vehicleTable()}
      </div>
    </div>`;
}

function vehicleForm() {
  return `
    <form id="vehicleForm" class="form">
      <div class="field full"><label>Şasi no</label><input name="chassisNo" required /></div>
      <div class="field"><label>Marka</label><input name="brand" required /></div>
      <div class="field"><label>Model</label><input name="model" required /></div>
      <div class="field"><label>Alım tarihi</label><input name="purchaseDate" type="date" value="${today()}" /></div>
      <div class="field"><label>Tam alış fiyatı</label><input name="purchasePrice" type="number" min="0" required /></div>
      <div class="field"><label>Plaka</label><input name="plateNo" /></div>
      <div class="field full"><label>Açıklama</label><textarea name="description"></textarea></div>
      <div class="actions full"><button class="btn primary">Araç kaydet</button></div>
    </form>`;
}

function vehicleTable() {
  const q = (state.vehicleSearch || "").toLocaleLowerCase("tr-TR");
  const filtered = state.vehicles.filter((v) => `${v.chassisNo} ${v.brand} ${v.model} ${v.plateNo}`.toLocaleLowerCase("tr-TR").includes(q));
  return table(["Şasi", "Marka", "Model", "Alım", "Alış fiyatı", "Plaka", "Kredi bağlantısı"], filtered.map((v) => [
    v.chassisNo,
    v.brand,
    v.model,
    v.purchaseDate,
    money(v.purchasePrice),
    v.plateNo || "-",
    state.allocations.filter((a) => a.vehicleId === v.id && a.isActive).length,
  ]));
}

function renderAllocations() {
  const activeCredits = state.credits.filter((c) => c.status === "active");
  return `
    <div class="grid cols-2">
      <div class="panel">
        <h2>Krediye Araç Bağla</h2>
        ${!canEdit() ? `<div class="notice">Rolünüz kayıt değiştirme yetkisine sahip değil.</div>` : `
          <form id="allocationForm" class="form">
            <div class="field full"><label>Kredi</label><select name="creditId">${activeCredits.map((c) => `<option value="${c.id}">${c.bankName} · ${creditTypes[c.creditType]} · ${money(c.principal)}</option>`).join("")}</select></div>
            <div class="field full"><label>Araç / Şasi</label><select name="vehicleId">${state.vehicles.map((v) => `<option value="${v.id}">${v.chassisNo} · ${v.brand} ${v.model}</option>`).join("")}</select></div>
            <div class="field"><label>Finanse edilen tutar</label><input name="financedAmount" type="number" min="0" required /></div>
            <div class="field"><label>Dağıtım başlangıç tarihi</label><input name="allocationStartDate" type="date" value="${today()}" /></div>
            <div class="actions full"><button class="btn primary">Eşleştir</button></div>
          </form>`}
      </div>
      <div class="panel">
        <h2>Aktif Eşleştirmeler</h2>
        ${allocationTable()}
      </div>
    </div>`;
}

function allocationTable() {
  return table(["Kredi", "Şasi", "Finanse tutar", "Ağırlık", "Başlangıç", "Durum", "İşlem"], state.allocations.map((a) => {
    const c = state.credits.find((x) => x.id === a.creditId);
    const v = state.vehicles.find((x) => x.id === a.vehicleId);
    return [
      c ? c.bankName : "-",
      v ? v.chassisNo : "-",
      money(a.financedAmount),
      pct(allocationWeight(a) * 100),
      a.allocationStartDate,
      `<span class="status ${a.isActive ? "" : "passive"}">${a.isActive ? "Aktif" : "Pasif"}</span>`,
      canEdit() ? `<button class="btn danger" data-passive-allocation="${a.id}">Pasifleştir</button>` : "-",
    ];
  }));
}

function renderCosts() {
  const date = state.costDate || today();
  const rows = state.vehicles.map((v) => {
    const cost = vehicleCost(v, date);
    return [v.chassisNo, `${v.brand} ${v.model}`, money(cost.purchasePrice), money(cost.financeCost), money(cost.currentCost)];
  });
  const creditRows = state.credits.map((c) => [c.bankName, creditTypes[c.creditType], money(c.principal), money(financeCostUntil(c, date))]);
  return `
    <div class="panel">
      <div class="toolbar">
        <div>
          <h2>Tarih Bazlı Maliyet Sorgusu</h2>
          <div class="hint">Faiz + BSMV yükü kredi kullanım tarihinden seçili tarihe kadar günlük dağıtılır.</div>
        </div>
        <input id="costDate" type="date" value="${date}" />
      </div>
      ${table(["Şasi", "Araç", "Tam alış fiyatı", "Birikmiş finansman", "Güncel maliyet"], rows)}
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="toolbar">
        <h2>Kredi Bazında Oluşan Finansman Yükü</h2>
        <button class="btn ghost" data-export="costs">CSV dışa aktar</button>
      </div>
      ${table(["Banka", "Kredi tipi", "Kredi tutarı", "Faiz + BSMV"], creditRows)}
    </div>`;
}

function renderReports() {
  const report = state.reportType || "vehicle";
  return `
    <div class="panel">
      <div class="toolbar">
        <div class="tabs">
          ${["vehicle", "credit", "bank", "monthly", "chassis"].map((id) => `<button class="${report === id ? "active" : ""}" data-report="${id}">${reportName(id)}</button>`).join("")}
        </div>
        <button class="btn ghost" data-export-report="${report}">CSV dışa aktar</button>
      </div>
      ${renderReportTable(report)}
    </div>`;
}

function reportName(id) {
  return { vehicle: "Araç maliyet", credit: "Kredi finansman", bank: "Banka borç", monthly: "Aylık faiz/BSMV", chassis: "Şasi maliyet" }[id];
}

function renderReportTable(report) {
  if (report === "vehicle" || report === "chassis") {
    return table(["Şasi", "Araç", "Alış", "Finansman", "Güncel"], state.vehicles.map((v) => {
      const c = vehicleCost(v, today());
      return [v.chassisNo, `${v.brand} ${v.model}`, money(c.purchasePrice), money(c.financeCost), money(c.currentCost)];
    }));
  }
  if (report === "credit") {
    return table(["Banka", "Tip", "Tutar", "Toplam faiz", "Toplam BSMV", "Durum"], state.credits.map((c) => {
      const rows = generateInstallments(c);
      return [c.bankName, creditTypes[c.creditType], money(c.principal), money(sum(rows, "interestAmount")), money(sum(rows, "bsmvAmount")), c.status];
    }));
  }
  if (report === "bank") {
    return table(["Banka", "Aktif kredi", "Kredi tutarı", "Kalan anapara"], groupBy(state.credits.filter((c) => c.status === "active"), "bankName", "principal").map((b) => {
      const credits = state.credits.filter((c) => c.bankName === b.name && c.status === "active");
      const remaining = credits.reduce((s, c) => {
        const rows = generateInstallments(c).filter((r) => parseDate(r.dueDate) <= parseDate(today()));
        return s + (rows.at(-1)?.closingPrincipal ?? Number(c.principal || 0));
      }, 0);
      return [b.name, credits.length, money(b.value), money(remaining)];
    }));
  }
  const months = {};
  state.credits.forEach((c) => generateInstallments(c).forEach((r) => {
    const key = r.dueDate.slice(0, 7);
    months[key] ||= { interest: 0, bsmv: 0 };
    months[key].interest += r.interestAmount;
    months[key].bsmv += r.bsmvAmount;
  }));
  return table(["Ay", "Faiz", "BSMV", "Toplam"], Object.entries(months).sort().map(([m, v]) => [m, money(v.interest), money(v.bsmv), money(v.interest + v.bsmv)]));
}

function renderUsers() {
  return `
    <div class="grid cols-2">
      <div class="panel">
        <h2>Rol Yetkileri</h2>
        ${table(["Rol", "Erişim"], [
          ["Yönetici", "Tüm modüller, kullanıcı yönetimi, kredi kapama"],
          ["Finans Kullanıcısı", "Kredi oluşturma, ödeme planı, araç eşleştirme, TLREF oranı"],
          ["Muhasebe Kullanıcısı", "Rapor ve maliyet ekranları, salt okunur"],
          ["Rapor Kullanıcısı", "Dashboard ve raporlar, salt okunur"],
        ])}
      </div>
      <div class="panel">
        <h2>Kullanıcılar</h2>
        ${table(["Ad", "E-posta", "Rol", "Durum"], state.users.map((u) => [u.name, u.email, roles[u.role], `<span class="status">${u.isActive ? "Aktif" : "Pasif"}</span>`]))}
      </div>
    </div>`;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty">Kayıt bulunamadı.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function groupBy(items, key, valueKey) {
  const map = {};
  items.forEach((item) => {
    map[item[key]] ||= 0;
    map[item[key]] += Number(item[valueKey] || 0);
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function sum(rows, key) {
  return rows.reduce((s, row) => s + Number(row[key] || 0), 0);
}

function bindLogin() {
  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.session = { name: roles[data.role], email: data.email, role: data.role };
    saveState();
    page = "dashboard";
    render();
  });
}

function bindShell() {
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    page = button.dataset.page;
    render();
  }));
  document.querySelector("[data-action='logout']")?.addEventListener("click", () => {
    state.session = null;
    saveState();
    render();
  });
  bindForms();
  bindActions();
}

function bindForms() {
  document.querySelector("#creditForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const credit = {
      id: uid(),
      bankName: data.bankName.trim(),
      creditType: data.creditType,
      subType: data.subType,
      disbursementDate: data.disbursementDate,
      firstPaymentDate: data.firstPaymentDate,
      paymentDay: Number(data.paymentDay),
      maturity: Number(data.maturity),
      principal: Number(data.principal),
      bsmvRate: Number(data.bsmvRate),
      fixedRate: Number(data.fixedRate),
      balloonAmount: Number(data.balloonAmount),
      balloonRatio: Number(data.balloonRatio),
      status: "active",
      tlrefPeriods: parseTlref(data.tlrefText),
      createdAt: today(),
    };
    const errors = validateCredit(credit);
    if (errors.length) return alert(errors.join("\\n"));
    state.credits.unshift(credit);
    state.selectedCreditId = credit.id;
    audit("credits", credit.id, "create", null, credit);
    saveState();
    render();
  });
  document.querySelector("#vehicleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (state.vehicles.some((v) => v.chassisNo.toLocaleLowerCase("tr-TR") === data.chassisNo.toLocaleLowerCase("tr-TR"))) return alert("Aynı şasi iki kere oluşturulamaz.");
    if (Number(data.purchasePrice) < 0) return alert("Negatif tutar girilemez.");
    const vehicle = { id: uid(), chassisNo: data.chassisNo.trim(), brand: data.brand.trim(), model: data.model.trim(), purchaseDate: data.purchaseDate, purchasePrice: Number(data.purchasePrice), plateNo: data.plateNo.trim(), description: data.description.trim(), createdAt: today(), updatedAt: today() };
    state.vehicles.unshift(vehicle);
    audit("vehicles", vehicle.id, "create", null, vehicle);
    saveState();
    render();
  });
  document.querySelector("#allocationForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const credit = state.credits.find((c) => c.id === data.creditId);
    if (!credit || credit.status === "closed") return alert("Kapalı krediye yeni araç bağlanamaz.");
    if (Number(data.financedAmount) <= 0) return alert("Finanse edilen tutar pozitif olmalıdır.");
    const allocation = { id: uid(), creditId: data.creditId, vehicleId: data.vehicleId, financedAmount: Number(data.financedAmount), allocationStartDate: data.allocationStartDate, isActive: true, createdAt: today(), updatedAt: today() };
    state.allocations.unshift(allocation);
    audit("credit_vehicle_allocations", allocation.id, "create", null, allocation);
    saveState();
    render();
  });
  document.querySelector("#vehicleSearch")?.addEventListener("input", (event) => {
    state.vehicleSearch = event.target.value;
    render();
  });
  document.querySelector("#costDate")?.addEventListener("change", (event) => {
    state.costDate = event.target.value;
    render();
  });
}

function bindActions() {
  document.querySelectorAll("[data-select-credit]").forEach((button) => button.addEventListener("click", () => {
    state.selectedCreditId = button.dataset.selectCredit;
    render();
  }));
  document.querySelectorAll("[data-close-credit]").forEach((button) => button.addEventListener("click", () => {
    const credit = state.credits.find((c) => c.id === button.dataset.closeCredit);
    if (!credit) return;
    credit.status = "closed";
    audit("credits", credit.id, "close", "active", "closed");
    saveState();
    render();
  }));
  document.querySelectorAll("[data-passive-allocation]").forEach((button) => button.addEventListener("click", () => {
    const allocation = state.allocations.find((a) => a.id === button.dataset.passiveAllocation);
    if (!allocation) return;
    allocation.isActive = false;
    allocation.updatedAt = today();
    audit("credit_vehicle_allocations", allocation.id, "passive", true, false);
    saveState();
    render();
  }));
  document.querySelectorAll("[data-report]").forEach((button) => button.addEventListener("click", () => {
    state.reportType = button.dataset.report;
    render();
  }));
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportNamed(button.dataset.export)));
  document.querySelectorAll("[data-export-report]").forEach((button) => button.addEventListener("click", () => exportReport(button.dataset.exportReport)));
  document.querySelectorAll("[data-export-installments]").forEach((button) => {
    button.addEventListener("click", () => {
      const credit = state.credits.find((c) => c.id === button.dataset.exportInstallments);
      exportCsv("odeme-plani.csv", generateInstallments(credit));
    });
  });
}

function parseTlref(text) {
  return String(text || "").split("\\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [periodNo, tlrefRate, bankCommissionRate] = line.split(",").map((x) => x.trim());
    return { periodNo: Number(periodNo), tlrefRate: Number(tlrefRate), bankCommissionRate: Number(bankCommissionRate) };
  }).filter((row) => row.periodNo && !Number.isNaN(row.tlrefRate) && !Number.isNaN(row.bankCommissionRate));
}

function audit(entityName, entityId, actionType, oldValue, newValue) {
  state.auditLogs.push({ id: uid(), userId: state.session?.email, entityName, entityId, actionType, oldValue, newValue, createdAt: new Date().toISOString() });
}

function exportNamed(name) {
  if (name === "credits") return exportCsv("krediler.csv", state.credits);
  if (name === "vehicles") return exportCsv("araclar.csv", state.vehicles);
  if (name === "costs") return exportCsv("maliyet.csv", state.vehicles.map((v) => ({ chassisNo: v.chassisNo, ...vehicleCost(v, state.costDate || today()) })));
}

function exportReport(report) {
  if (report === "credit") {
    return exportCsv("kredi-finansman-raporu.csv", state.credits.map((c) => {
      const rows = generateInstallments(c);
      return { bankName: c.bankName, creditType: creditTypes[c.creditType], principal: c.principal, totalInterest: sum(rows, "interestAmount"), totalBsmv: sum(rows, "bsmvAmount"), status: c.status };
    }));
  }
  return exportCsv("arac-maliyet-raporu.csv", state.vehicles.map((v) => ({ chassisNo: v.chassisNo, brand: v.brand, model: v.model, ...vehicleCost(v, today()) })));
}

function exportCsv(filename, rows) {
  if (!rows || !rows.length) return alert("Dışa aktarılacak kayıt yok.");
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(";"), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(";"))].join("\\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

render();
