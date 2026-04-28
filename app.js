/* Expense Tracker Website (College Edition)
   - OOP structure in JS (User/Auth, Transaction, ExpenseTracker, Analytics, AIAdvisor)
   - Persistent storage per-user in localStorage
   - Charts: simple canvas pie + bar charts (no external libs)
*/

class Storage {
  static keyUsers() { return "et_users_v1"; }
  static keySession() { return "et_session_v1"; }
  static keyTx(username) { return `et_txs_v1_${username}`; }
  static keyBank(username) { return `et_bank_v1_${username}`; }

  static loadUsers() {
    try { return JSON.parse(localStorage.getItem(Storage.keyUsers()) || "[]"); }
    catch { return []; }
  }
  static saveUsers(users) {
    localStorage.setItem(Storage.keyUsers(), JSON.stringify(users));
  }
  static loadTx(username) {
    try { return JSON.parse(localStorage.getItem(Storage.keyTx(username)) || "[]"); }
    catch { return []; }
  }
  static saveTx(username, txs) {
    localStorage.setItem(Storage.keyTx(username), JSON.stringify(txs));
  }
  static loadSession() {
    try { return JSON.parse(localStorage.getItem(Storage.keySession()) || "null"); }
    catch { return null; }
  }
  static saveSession(sess) {
    localStorage.setItem(Storage.keySession(), JSON.stringify(sess));
  }
  static clearSession() {
    localStorage.removeItem(Storage.keySession());
  }

  static loadBank(username) {
    try { return JSON.parse(localStorage.getItem(Storage.keyBank(username)) || "null"); }
    catch { return null; }
  }
  static saveBank(username, bankObj) {
    localStorage.setItem(Storage.keyBank(username), JSON.stringify(bankObj));
  }
  static clearBank(username) {
    localStorage.removeItem(Storage.keyBank(username));
  }
}

class User {
  static isValidUsername(u) {
    const s = (u || "").trim();
    if (s.length < 3 || s.length > 20) return false;
    return /^[a-zA-Z0-9_-]+$/.test(s);
  }
  static isValidPassword(p) {
    return (p || "").length >= 4;
  }
  static hash(username, password) {
    // Demo hash (not secure). Good enough for offline browser demo.
    const str = `${username}|${password}|expense-tracker-salt-v1`;
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  static register(username, password) {
    const u = (username || "").trim();
    if (!User.isValidUsername(u)) return { ok:false, error:"Username must be 3-20 chars: letters/numbers/_/- only." };
    if (!User.isValidPassword(password)) return { ok:false, error:"Password must be at least 4 characters." };
    const users = Storage.loadUsers();
    if (users.some(x => x.username === u)) return { ok:false, error:"Username already exists." };
    users.push({ username: u, password_hash: User.hash(u, password) });
    Storage.saveUsers(users);
    return { ok:true };
  }

  static login(username, password) {
    const u = (username || "").trim();
    const users = Storage.loadUsers();
    const found = users.find(x => x.username === u);
    if (!found) return { ok:false, error:"User not found. Please register." };
    if (found.password_hash !== User.hash(u, password)) return { ok:false, error:"Incorrect password." };
    Storage.saveSession({ username: u });
    return { ok:true };
  }
}

class Transaction {
  constructor({ id, type, amount, category, date, note }) {
    this.id = id;
    this.type = type; // "income" | "expense"
    this.amount = amount;
    this.category = category;
    this.date = date; // "YYYY-MM-DD"
    this.note = note || "";
  }
  static todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
}

class ExpenseTracker {
  constructor(username) {
    this.username = username;
    this.txs = Storage.loadTx(username).map(x => new Transaction(x));
    this._idCounter = 0;
  }
  save() { Storage.saveTx(this.username, this.txs); }
  nextId() { return `${Date.now()}-${++this._idCounter}`; }

  add({ type, amount, category, date, note }) {
    const t = new Transaction({
      id: this.nextId(),
      type,
      amount,
      category,
      date,
      note
    });
    this.txs.push(t);
    return t;
  }
  deleteById(id) {
    const before = this.txs.length;
    this.txs = this.txs.filter(t => t.id !== id);
    return this.txs.length !== before;
  }

  summary() {
    let income = 0, expense = 0;
    for (const t of this.txs) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, balance: income - expense };
  }
  expenseByCategory() {
    const m = new Map();
    for (const t of this.txs) {
      if (t.type !== "expense") continue;
      m.set(t.category, (m.get(t.category) || 0) + t.amount);
    }
    return m;
  }
  highestSpendingCategory() {
    const m = this.expenseByCategory();
    let best = null;
    for (const [cat, amt] of m.entries()) {
      if (!best || amt > best.amount) best = { category: cat, amount: amt };
    }
    return best;
  }
}

class Analytics {
  static periodLabel(dateISO, period) {
    const d = new Date(`${dateISO}T12:00:00`);
    const y = d.getFullYear();
    const pad = (n) => String(n).padStart(2, "0");
    if (period === "year") return `${y}`;
    if (period === "month") return `${y}-${pad(d.getMonth()+1)}`;
    // week bucket (Mon-start, simple)
    const day = d.getDay(); // 0 Sun..6 Sat
    const mondayOffset = (day + 6) % 7;
    d.setDate(d.getDate() - mondayOffset);
    const weekYear = d.getFullYear();
    const start = new Date(weekYear, 0, 1);
    const diffDays = Math.floor((d - start) / (24*3600*1000));
    const weekNum = Math.floor(diffDays / 7) + 1;
    return `${weekYear}-W${pad(weekNum)}`;
  }

  static totalsByPeriod(txs, period) {
    const buckets = new Map();
    for (const t of txs) {
      const label = Analytics.periodLabel(t.date, period);
      if (!buckets.has(label)) buckets.set(label, { label, income:0, expense:0, net:0 });
      const b = buckets.get(label);
      if (t.type === "income") b.income += t.amount;
      else b.expense += t.amount;
    }
    const out = [...buckets.values()].sort((a,b) => a.label.localeCompare(b.label));
    for (const x of out) x.net = x.income - x.expense;
    return out;
  }

  static compareLatestTwo(txs, period) {
    const totals = Analytics.totalsByPeriod(txs, period);
    if (totals.length < 2) return null;
    const prev = totals[totals.length - 2];
    const cur = totals[totals.length - 1];
    const delta = cur.expense - prev.expense;
    const pct = prev.expense > 0 ? (delta / prev.expense) * 100 : 0;
    return {
      current: cur,
      previous: prev,
      delta_expense: delta,
      percent_change: pct,
      money_saved: delta < 0 ? -delta : 0,
      extra_spending: delta > 0 ? delta : 0
    };
  }
}

class AIAdvisor {
  static money(v) {
    return `₹${Math.round(v).toLocaleString("en-IN")}`;
  }
  static analyze(tracker) {
    const out = { alerts: [], suggestions: [], forecast: { next_week: 0, next_month: 0 } };
    const sum = tracker.summary();
    const hi = tracker.highestSpendingCategory();

    if (hi && sum.expense > 0) {
      const pct = (hi.amount / sum.expense) * 100;
      if (pct >= 30) out.alerts.push(`Reduce ${hi.category} spending by 20% (it is ~${pct.toFixed(0)}% of your expenses).`);
    }

    if (sum.income > 0 && sum.expense > 0) {
      const savingsRate = (sum.income - sum.expense) / sum.income;
      if (savingsRate < 0.10) out.suggestions.push("Try a student rule: save at least 10% of income first.");
      else if (savingsRate > 0.25) out.suggestions.push("Nice! You're saving >25%. Consider investing part of the surplus.");
    }

    const cmpW = Analytics.compareLatestTwo(tracker.txs, "week");
    if (cmpW) {
      if (cmpW.money_saved > 0) out.alerts.push(`You saved ${AIAdvisor.money(cmpW.money_saved)} this week.`);
      else if (cmpW.extra_spending > 0) out.alerts.push(`You spent ${AIAdvisor.money(cmpW.extra_spending)} extra this week (${Math.abs(cmpW.percent_change).toFixed(0)}% increase).`);
    }

    const cmpM = Analytics.compareLatestTwo(tracker.txs, "month");
    if (cmpM && cmpM.extra_spending > 0 && Math.abs(cmpM.percent_change) >= 15) {
      out.alerts.push("Monthly spending jumped. Review your top categories and set limits.");
    }

    // Forecast: moving average
    const weeks = Analytics.totalsByPeriod(tracker.txs, "week");
    if (weeks.length) {
      const last = weeks.slice(-4);
      out.forecast.next_week = last.reduce((a,b) => a + b.expense, 0) / last.length;
    }
    const months = Analytics.totalsByPeriod(tracker.txs, "month");
    if (months.length) {
      const last = months.slice(-3);
      out.forecast.next_month = last.reduce((a,b) => a + b.expense, 0) / last.length;
    }

    // Practical saving suggestions
    const byCat = tracker.expenseByCategory();
    const top = [...byCat.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);

    // If spending exceeds income, give an immediate "stop the bleed" plan.
    if (sum.income > 0 && sum.expense > sum.income) {
      const gap = sum.expense - sum.income;
      out.alerts.push(`You're overspending by ${AIAdvisor.money(gap)} overall. Cut non-essentials and set hard weekly limits.`);
      out.suggestions.push("Start with a 48-hour rule for non-essential purchases (wait 2 days before buying).");
      out.suggestions.push("Use cash/envelope budgeting for Food + Entertainment for the next 2 weeks.");
    }

    // Savings goal suggestion based on last month cashflow (if possible).
    if (months.length) {
      const cur = months[months.length - 1];
      if (cur.income > 0) {
        const targetRate = 0.15; // student-friendly target
        const target = cur.income * targetRate;
        out.suggestions.push(`Next month goal: auto-save ~15% of income (${AIAdvisor.money(target)}) on day 1.`);
      }
    }

    // Category reduction targets + tactical tips
    for (const [cat, amt] of top) {
      if (amt <= 0) continue;

      const weeklyCap = amt / 4;
      out.suggestions.push(`Set a weekly cap for ${cat}: ~${AIAdvisor.money(weeklyCap)} (based on your recent spend).`);

      const reduceBy = 0.15; // default 15% cut
      const saveAmt = amt * reduceBy;
      out.suggestions.push(`If you cut ${cat} by 15%, you could save ~${AIAdvisor.money(saveAmt)} over a similar period.`);

      const catLower = String(cat).toLowerCase();
      if (catLower.includes("food")) {
        out.suggestions.push("Food tip: plan 3 low-cost meals/week, carry a water bottle, and avoid daily delivery.");
      } else if (catLower.includes("travel") || catLower.includes("transport")) {
        out.suggestions.push("Travel tip: batch errands, use student passes, and pick off-peak travel when possible.");
      } else if (catLower.includes("entertain") || catLower.includes("movie") || catLower.includes("fun")) {
        out.suggestions.push("Entertainment tip: set 1 paid-outing/week; use campus events and free alternatives.");
      } else if (catLower.includes("books") || catLower.includes("study")) {
        out.suggestions.push("Books tip: borrow from library, buy used, or share/photocopy allowed materials.");
      } else if (catLower.includes("rent") || catLower.includes("hostel")) {
        out.suggestions.push("Rent tip: if rent is fixed, focus cuts on Food/Entertainment/Travel instead.");
      } else if (catLower.includes("misc")) {
        out.suggestions.push("Misc tip: review 'small buys' weekly—cancel repeats and remove stored card info from apps.");
      }
    }

    // Compare last 2 months: detect a rising category and warn.
    if (months.length >= 2) {
      const curLabel = months[months.length - 1].label;
      const prevLabel = months[months.length - 2].label;
      const monthTx = (label) => tracker.txs.filter(t => Analytics.periodLabel(t.date, "month") === label && t.type === "expense");
      const sumByCat = (arr) => {
        const m = new Map();
        for (const t of arr) m.set(t.category, (m.get(t.category) || 0) + t.amount);
        return m;
      };
      const curMap = sumByCat(monthTx(curLabel));
      const prevMap = sumByCat(monthTx(prevLabel));
      let worst = null;
      for (const [cat, curAmt] of curMap.entries()) {
        const prevAmt = prevMap.get(cat) || 0;
        const delta = curAmt - prevAmt;
        if (!worst || delta > worst.delta) worst = { cat, delta, curAmt, prevAmt };
      }
      if (worst && worst.delta > 0) {
        out.alerts.push(`${worst.cat} increased by ${AIAdvisor.money(worst.delta)} vs last month. Consider a tighter cap this month.`);
      }
    }

    if (!tracker.txs.length) out.suggestions.push("Add a few expenses to unlock category charts and AI insights.");
    if (!out.alerts.length) out.alerts.push("No alerts right now. Keep tracking regularly.");
    return out;
  }
}

function seedExampleUserIfMissing() {
  // Creates a demo user with ~2 years of data (only if not already present).
  const demoUser = "student_2yr";
  const demoPass = "demo1234";

  const users = Storage.loadUsers();
  const exists = users.some(u => u.username === demoUser);
  if (!exists) {
    users.push({ username: demoUser, password_hash: User.hash(demoUser, demoPass) });
    Storage.saveUsers(users);
  }

  const ensureSeededUser = (username, monthsBack, monthlyIncome, extraNote = "") => {
    const existing = Storage.loadTx(username);
    if (existing.length > 0) return;

    const txs = [];
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const expenseCats = [
      { cat: "Food", base: 2500, jitter: 700 },
      { cat: "Rent", base: 3500, jitter: 0 },
      { cat: "Travel", base: 900, jitter: 350 },
      { cat: "Books", base: 450, jitter: 400 },
      { cat: "Entertainment", base: 600, jitter: 500 },
      { cat: "Bills", base: 700, jitter: 300 },
      { cat: "Health", base: 250, jitter: 250 },
      { cat: "Misc", base: 300, jitter: 450 }
    ];

    let idCounter = 0;
    const nextId = (d) => `${d.getTime()}-${++idCounter}`;
    const rand01 = (x) => {
      const s = Math.sin(x) * 10000;
      return s - Math.floor(s);
    };

    let monthIndex = 0;
    for (let y = start.getFullYear(); y <= today.getFullYear(); y++) {
      for (let m = (y === start.getFullYear() ? start.getMonth() : 0);
           m <= (y === today.getFullYear() ? today.getMonth() : 11);
           m++) {
        monthlyIncome.forEach((inc, i) => {
          const d = new Date(y, m, i === 0 ? 1 : (i === 1 ? 5 : 10));
          txs.push(new Transaction({
            id: nextId(d),
            type: "income",
            amount: inc.amount + Math.round((rand01(monthIndex * 10 + i) - 0.5) * 220),
            category: inc.cat,
            date: iso(d),
            note: `Monthly income${extraNote ? " · " + extraNote : ""}`
          }));
        });

        expenseCats.forEach((ex, i) => {
          const day = 2 + ((i * 3 + monthIndex) % 24);
          const d = new Date(y, m, Math.min(day, 28));
          const r = rand01(monthIndex * 100 + i);
          const amt = ex.base + Math.round((r - 0.5) * (ex.jitter * 2));
          if (amt <= 0) return;
          txs.push(new Transaction({
            id: nextId(d),
            type: "expense",
            amount: amt,
            category: ex.cat,
            date: iso(d),
            note: ex.cat === "Books" && (m === 5 || m === 11) ? "Semester books" : ""
          }));
        });

        if (m === 6 || m === 0) {
          const d = new Date(y, m, 15);
          txs.push(new Transaction({
            id: nextId(d),
            type: "expense",
            amount: 1800 + Math.round(rand01(monthIndex * 7) * 700),
            category: "Travel",
            date: iso(d),
            note: "Trip / holiday travel"
          }));
        }
        monthIndex++;
      }
    }
    Storage.saveTx(username, txs);
  };

  ensureSeededUser(demoUser, 23, [
    { cat: "Allowance", amount: 4000 },
    { cat: "Part-time", amount: 2500 },
    { cat: "Scholarship", amount: 1200 }
  ]);

  // New 3-year demo account + demo Axis bank connection
  const demoUser3 = "student_3yr";
  const demoPass3 = "demo3456";
  const usersNow = Storage.loadUsers();
  if (!usersNow.some((u) => u.username === demoUser3)) {
    usersNow.push({ username: demoUser3, password_hash: User.hash(demoUser3, demoPass3) });
    Storage.saveUsers(usersNow);
  }
  ensureSeededUser(demoUser3, 35, [
    { cat: "Salary", amount: 28000 },
    { cat: "Freelance", amount: 3500 }
  ], "3-year profile");

  // Auto connect demo Axis bank for this user if not already connected.
  const b = Storage.loadBank(demoUser3);
  if (!b || !b.connected) {
    Storage.saveBank(demoUser3, {
      connected: true,
      connected_at: Date.now(),
      bank_name: "Axis",
      account_holder: demoUser3,
      account_mask: "XXXX-4582",
      ifsc: "UTIB0000458",
      source: "demo"
    });
  }
}

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
const fmtINR = (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function salaryKey(username) { return `et_salary_category_v1_${username}`; }
function recurringSalaryKey(username) { return `et_recurring_salary_v1_${username}`; }

function monthKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function dateIso(y, m1to12, day1to28) {
  const m = String(m1to12).padStart(2, "0");
  const d = String(day1to28).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadRecurringSalary(username) {
  try {
    return JSON.parse(localStorage.getItem(recurringSalaryKey(username)) || "null");
  } catch {
    return null;
  }
}

function saveRecurringSalary(username, cfg) {
  localStorage.setItem(recurringSalaryKey(username), JSON.stringify(cfg));
}

function applyRecurringSalaryIfNeeded() {
  if (!tracker) return 0;
  const cfg = loadRecurringSalary(tracker.username);
  if (!cfg || !cfg.enabled) return 0;

  const amount = Number(cfg.amount || 0);
  const day = Math.max(1, Math.min(28, Number(cfg.day || 1)));
  const category = String(cfg.category || "Salary").trim() || "Salary";
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const today = new Date();
  const currentMonth = monthKeyFromDate(today);
  const startMonth = cfg.last_applied_month || currentMonth;

  // Convert YYYY-MM to number index for month iteration.
  const toIndex = (mk) => {
    const [y, m] = mk.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const fromIndex = (idx) => {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return { y, m };
  };

  let imported = 0;
  const startIdx = toIndex(startMonth);
  const endIdx = toIndex(currentMonth);

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const { y, m } = fromIndex(idx);
    const iso = dateIso(y, m, day);

    // Don't add for future date in current month.
    if (idx === endIdx) {
      const [yy, mm, dd] = iso.split("-").map(Number);
      const payoutDate = new Date(yy, mm - 1, dd);
      if (payoutDate > today) break;
    }

    // Avoid duplicates if already present.
    const exists = tracker.txs.some(
      (t) =>
        t.type === "income" &&
        t.date === iso &&
        String(t.category || "").toLowerCase() === category.toLowerCase() &&
        String(t.note || "").toLowerCase().includes("recurring salary")
    );
    if (!exists) {
      tracker.add({
        type: "income",
        amount,
        category,
        date: iso,
        note: "Recurring salary"
      });
      imported++;
    }
  }

  if (imported > 0) tracker.save();
  // Mark as processed up to current month.
  saveRecurringSalary(tracker.username, {
    ...cfg,
    amount,
    day,
    category,
    enabled: true,
    last_applied_month: currentMonth
  });
  return imported;
}

const COLORS = {
  green: "#3cc878",
  red: "#dc4646",
  blue: "#7a93ff",
  amber: "#dcb43c",
  bg: "#0b0c10",
  panel: "#121522",
  border: "rgba(255,255,255,0.10)"
};
const PALETTE = ["#3cc878","#dc4646","#7a93ff","#dcb43c","#a05adc","#50c8c8","#ff7a59","#8bd450"];

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);
  return { ctx, w: cssW, h: cssH };
}

function drawPie(canvas, legendEl, items) {
  const { ctx, w, h } = clearCanvas(canvas);
  ctx.fillStyle = "rgba(0,0,0,0.0)";
  ctx.fillRect(0,0,w,h);

  const total = items.reduce((a,b)=>a + Math.max(0,b.value), 0);
  legendEl.innerHTML = "";
  if (total <= 0) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "14px system-ui";
    ctx.fillText("No data yet.", 16, 28);
    return;
  }

  const r = Math.min(w, h) * 0.32;
  const cx = w * 0.55;
  const cy = h * 0.52;
  let start = -Math.PI/2;

  items.forEach((it, i) => {
    const val = Math.max(0, it.value);
    if (val <= 0) return;
    const ang = (val / total) * Math.PI * 2;
    const end = start + ang;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = it.color || PALETTE[i % PALETTE.length];
    ctx.fill();
    start = end;

    const li = document.createElement("div");
    li.className = "legend-item";
    li.innerHTML = `<span class="dot" style="background:${ctx.fillStyle}"></span><span>${it.label}: ${fmtINR(val)}</span>`;
    legendEl.appendChild(li);
  });
}

function drawBars(canvas, totals, { mode = "expense", maxBars = 10 } = {}) {
  const { ctx, w, h } = clearCanvas(canvas);
  const data = totals.slice(-maxBars);
  if (!data.length) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "14px system-ui";
    ctx.fillText("No data yet.", 16, 28);
    return;
  }

  const pad = 16;
  const baseY = h - 34;
  const chartH = h - 60;
  const maxVal = Math.max(1, ...data.map(x => mode === "expense" ? x.expense : x.income));
  const barW = (w - pad*2) / data.length;
  const col = mode === "expense" ? COLORS.red : COLORS.green;

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.moveTo(pad, baseY);
  ctx.lineTo(w - pad, baseY);
  ctx.stroke();

  data.forEach((t, i) => {
    const v = mode === "expense" ? t.expense : t.income;
    const bh = (v / maxVal) * (chartH - 8);
    const x = pad + i * barW + 8;
    const y = baseY - bh;
    ctx.fillStyle = col;
    roundRect(ctx, x, y, Math.max(8, barW - 16), bh, 6);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "11px system-ui";
  const show = Math.min(6, data.length);
  const last = data.slice(-show);
  last.forEach((t, idx) => {
    const i = data.length - show + idx;
    const x = pad + i * barW + 8;
    ctx.fillText(t.label, x, h - 14);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = clamp(r, 0, Math.min(w/2, h/2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- App state ----------
let route = "home";
let isRegisterMode = false;
let addType = "expense";
let quickType = "expense";
let tracker = null;

function setRoute(r) {
  route = r;
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.route === r);
  });
  ["home","add","reports","ai"].forEach(v => {
    $(v + "View").classList.toggle("hidden", v !== r);
  });
  renderAll();
}

function showAuth() {
  $("authView").classList.remove("hidden");
  ["home","add","reports","ai"].forEach(v => $(v+"View").classList.add("hidden"));
  $("userBadge").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

function showApp(username) {
  $("authView").classList.add("hidden");
  $("userBadge").textContent = `@${username}`;
  $("userBadge").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  setRoute(route);
}

// ---------- Bank (demo connect + CSV import) ----------
function openBankModal() {
  $("bankModal").classList.remove("hidden");
  renderBankStatus();
}
function closeBankModal() {
  $("bankModal").classList.add("hidden");
  $("bankImportError").classList.add("hidden");
}

function bankState() {
  if (!tracker) return null;
  return Storage.loadBank(tracker.username) || { connected: false, connected_at: null };
}
function setBankState(next) {
  if (!tracker) return;
  Storage.saveBank(tracker.username, next);
  renderBankStatus();
}
function renderBankStatus() {
  if (!tracker) return;
  const st = bankState();
  const connected = !!st?.connected;
  if (!connected) {
    $("bankStatus").textContent = "Not connected";
  } else {
    const bankName = st.bank_name ? ` · ${st.bank_name}` : "";
    const mask = st.account_mask ? ` · ${st.account_mask}` : "";
    $("bankStatus").textContent =
      `Connected${bankName}${mask} · ${new Date(st.connected_at).toLocaleString()}`;
  }
  $("bankMsg").textContent = connected
    ? "You can import CSV transactions or simulate a sync. (Live bank login requires backend integration.)"
    : "Select a bank and connect. (Live bank login requires backend integration.)";
}

function parseBankDetails(text, filename = "") {
  const name = (filename || "").toLowerCase();
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false, error: "Empty file." };

  // JSON format
  if (name.endsWith(".json") || trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      const bank_name = String(obj.bank_name || obj.bank || "").trim();
      const account_holder = String(obj.account_holder || obj.holder || "").trim();
      const account_last4 = String(obj.account_last4 || obj.last4 || "").trim();
      const ifsc = String(obj.ifsc || "").trim();
      if (!bank_name || !account_last4) return { ok: false, error: "JSON must include bank_name and account_last4." };
      return {
        ok: true,
        details: {
          bank_name,
          account_holder,
          account_mask: `XXXX-${account_last4}`,
          ifsc
        }
      };
    } catch {
      return { ok: false, error: "Invalid JSON." };
    }
  }

  // CSV format: bank_name,account_holder,account_last4,ifsc (header optional)
  const lines = trimmed.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: "Empty CSV." };
  let row = lines[0];
  if (row.toLowerCase().includes("bank") && lines.length > 1) row = lines[1];
  const parts = row.split(",").map(x => x.trim());
  if (parts.length < 2) return { ok: false, error: "CSV needs at least: bank_name,account_last4 (or bank_name,account_holder,account_last4,ifsc)." };
  const bank_name = parts[0] || "";
  const account_holder = parts.length >= 4 ? (parts[1] || "") : "";
  const account_last4 = parts.length >= 4 ? (parts[2] || "") : (parts[1] || "");
  const ifsc = parts.length >= 4 ? (parts[3] || "") : "";
  if (!bank_name || !account_last4) return { ok: false, error: "CSV must include bank_name and account_last4." };
  return { ok: true, details: { bank_name, account_holder, account_mask: `XXXX-${account_last4}`, ifsc } };
}

function parseCsv(text) {
  // Simple CSV: each line "date,description,amount"
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const date = parts[0].trim();
    const amount = Number(parts[parts.length - 1].trim());
    const description = parts.slice(1, parts.length - 1).join(",").trim();
    rows.push({ date, description, amount });
  }
  return rows;
}

function inferCategory(description) {
  const d = (description || "").toLowerCase();
  if (d.includes("swiggy") || d.includes("zomato") || d.includes("cafe") || d.includes("restaurant")) return "Food";
  if (d.includes("uber") || d.includes("ola") || d.includes("metro") || d.includes("bus") || d.includes("petrol") || d.includes("fuel")) return "Travel";
  if (d.includes("netflix") || d.includes("spotify") || d.includes("movie") || d.includes("bookmyshow")) return "Entertainment";
  if (d.includes("rent") || d.includes("hostel")) return "Rent";
  if (d.includes("electric") || d.includes("water") || d.includes("recharge") || d.includes("wifi") || d.includes("internet")) return "Bills";
  if (d.includes("pharmacy") || d.includes("hospital")) return "Health";
  return "Misc";
}

function importBankRows(rows) {
  if (!tracker) return { ok:false, error:"Not logged in." };
  const st = bankState();
  if (!st?.connected) return { ok:false, error:"Connect bank (demo) first." };

  let imported = 0;
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if (!Number.isFinite(r.amount) || r.amount === 0) continue;
    const type = r.amount > 0 ? "income" : "expense";
    const amt = Math.abs(r.amount);
    const category = inferCategory(r.description);
    tracker.add({
      type,
      amount: amt,
      category,
      date: r.date,
      note: `Bank: ${r.description}`.slice(0, 90)
    });
    imported++;
  }
  tracker.save();
  renderAll();
  return { ok:true, imported };
}

// ---------- Rendering ----------
function renderHome() {
  if (!tracker) return;
  const sum = tracker.summary();
  $("statIncome").textContent = fmtINR(sum.income);
  $("statExpense").textContent = fmtINR(sum.expense);
  $("statBalance").textContent = fmtINR(sum.balance);
  $("statBalance").classList.toggle("green", sum.balance >= 0);
  $("statBalance").classList.toggle("red", sum.balance < 0);

  const hi = tracker.highestSpendingCategory();
  $("statHighest").textContent = hi ? `${hi.category} · ${fmtINR(hi.amount)}` : "—";

  // Salary-only (income filtered by chosen category keyword)
  const recurringCfg = loadRecurringSalary(tracker.username);
  const defaultSalaryCat = (recurringCfg?.category || "Salary").trim() || "Salary";
  const savedCat = (localStorage.getItem(salaryKey(tracker.username)) || defaultSalaryCat).trim() || "Salary";
  if ($("salaryCategory") && $("salaryCategory").value !== savedCat) $("salaryCategory").value = savedCat;
  const needle = savedCat.toLowerCase();
  let salaryTotal = 0;
  for (const t of tracker.txs) {
    if (t.type !== "income") continue;
    const c = String(t.category || "").toLowerCase();
    if (c === needle || c.includes(needle)) salaryTotal += t.amount;
  }
  // Smart fallback for common salary-like categories when strict category has no matches.
  if (salaryTotal <= 0) {
    const salaryLike = ["salary", "allowance", "stipend", "part-time", "part time", "scholarship", "payout"];
    for (const t of tracker.txs) {
      if (t.type !== "income") continue;
      const c = String(t.category || "").toLowerCase();
      if (salaryLike.some((k) => c.includes(k))) salaryTotal += t.amount;
    }
  }
  const recurringAmount = Number(recurringCfg?.amount || 0);
  const displaySalary = (recurringCfg?.enabled && recurringAmount > 0) ? recurringAmount : salaryTotal;
  if ($("statSalary")) $("statSalary").textContent = fmtINR(displaySalary);

  // Recurring salary UI defaults/status
  const rec = recurringCfg;
  if (rec && $("salaryRecurringAmount") && $("salaryRecurringDay")) {
    if (!$("salaryRecurringAmount").value) $("salaryRecurringAmount").value = String(rec.amount || "");
    if (!$("salaryRecurringDay").value) $("salaryRecurringDay").value = String(rec.day || 1);
  }
  if ($("salaryRecurringMsg")) {
    if (rec?.enabled) {
      $("salaryRecurringMsg").textContent =
        `Recurring salary active: ${fmtINR(Number(rec.amount || 0))} on day ${rec.day || 1} in category "${rec.category || "Salary"}".`;
    } else {
      $("salaryRecurringMsg").textContent = "Recurring salary is not set.";
    }
  }

  // table (latest 40)
  const body = $("txTableBody");
  body.innerHTML = "";
  const txs = tracker.txs.slice().reverse().slice(0, 40);
  for (const t of txs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.date}</td>
      <td><span class="pill ${t.type}">${t.type}</span></td>
      <td>${escapeHtml(t.category)}</td>
      <td class="right">${fmtINR(t.amount)}</td>
      <td>${escapeHtml(t.note || "")}</td>
      <td class="right"><button class="btn btn-ghost small" data-del="${t.id}">Delete</button></td>
    `;
    body.appendChild(tr);
  }
  body.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      tracker.deleteById(btn.dataset.del);
      tracker.save();
      renderAll();
    });
  });

  // pie charts
  const byCat = [...tracker.expenseByCategory().entries()]
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6)
    .map(([cat, amt], i) => ({ label: cat, value: amt, color: PALETTE[i % PALETTE.length] }));
  drawPie($("pieCategories"), $("pieCategoriesLegend"), byCat);
  drawPie($("pieIncomeExpense"), $("pieIncomeExpenseLegend"), [
    { label:"Income", value: sum.income, color: COLORS.green },
    { label:"Expense", value: sum.expense, color: COLORS.red }
  ]);
}

function renderReports() {
  if (!tracker) return;
  const cmpW = Analytics.compareLatestTwo(tracker.txs, "week");
  const cmpM = Analytics.compareLatestTwo(tracker.txs, "month");
  const cmpY = Analytics.compareLatestTwo(tracker.txs, "year");
  renderCmp($("weeklyCmp"), cmpW);
  renderCmp($("monthlyCmp"), cmpM);
  renderCmp($("yearlyCmp"), cmpY);

  const weeks = Analytics.totalsByPeriod(tracker.txs, "week");
  const months = Analytics.totalsByPeriod(tracker.txs, "month");
  drawBars($("barWeekly"), weeks, { mode: "expense", maxBars: 10 });
  drawBars($("barMonthly"), months, { mode: "expense", maxBars: 10 });

  renderTotalsTable($("weeklyTotalsBody"), weeks.slice(-6), "week");
  renderTotalsTable($("monthlyTotalsBody"), months.slice(-6), "month");
}

function renderAI() {
  if (!tracker) return;
  const advice = AIAdvisor.analyze(tracker);
  $("aiAlerts").innerHTML = advice.alerts.map(x => `<li>${escapeHtml(x)}</li>`).join("");
  $("aiSuggestions").innerHTML = advice.suggestions.map(x => `<li>${escapeHtml(x)}</li>`).join("");
  $("aiForecast").innerHTML = `
    <div>Predicted next week expenses: <b>${fmtINR(advice.forecast.next_week)}</b></div>
    <div>Predicted next month expenses: <b>${fmtINR(advice.forecast.next_month)}</b></div>
  `;
}

function renderAll() {
  if (!tracker) return;
  if (route === "home") renderHome();
  if (route === "reports") renderReports();
  if (route === "ai") renderAI();
}

function renderCmp(el, cmp) {
  if (!cmp) {
    el.innerHTML = `<div class="muted">Not enough data yet (need 2+ periods).</div>`;
    return;
  }
  const better = cmp.delta_expense <= 0;
  const arrow = cmp.delta_expense < 0 ? "↓" : (cmp.delta_expense > 0 ? "↑" : "→");
  const badgeClass = better ? "good" : "bad";
  const badgeText = better ? "Better (spent less)" : "Worse (spent more)";

  el.innerHTML = `
    <div class="report-grid">
      <div class="report-row">
        <div class="report-key">Current period</div>
        <div class="report-val">${cmp.current.label}</div>
      </div>
      <div class="report-row">
        <div class="report-key">Expense (current)</div>
        <div class="report-val">${fmtINR(cmp.current.expense)}</div>
      </div>
      <div class="report-row">
        <div class="report-key">Expense (previous)</div>
        <div class="report-val">${fmtINR(cmp.previous.expense)}</div>
      </div>
      <div class="report-row">
        <div class="report-key">Change</div>
        <div class="report-val">
          <span class="badge-mini ${badgeClass}">${arrow} ${fmtINR(cmp.delta_expense)} (${cmp.percent_change.toFixed(1)}%)</span>
        </div>
      </div>
      <div class="report-row">
        <div class="report-key">Result</div>
        <div class="report-val"><span class="badge-mini ${badgeClass}">${badgeText}</span></div>
      </div>
      <div class="report-row">
        <div class="report-key">Money saved</div>
        <div class="report-val" style="color:${COLORS.green}">${fmtINR(cmp.money_saved)}</div>
      </div>
      <div class="report-row">
        <div class="report-key">Extra spending</div>
        <div class="report-val" style="color:${COLORS.red}">${fmtINR(cmp.extra_spending)}</div>
      </div>
    </div>
  `;
}

function renderTotalsTable(tbody, totals, mode) {
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!totals.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">No data yet.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const t of totals) {
    const net = t.income - t.expense;
    const netCol = net >= 0 ? "green" : "red";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.label)}</td>
      <td class="right">${fmtINR(t.income)}</td>
      <td class="right">${fmtINR(t.expense)}</td>
      <td class="right"><span class="${netCol}">${fmtINR(net)}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

// ---------- Events ----------
function init() {
  seedExampleUserIfMissing();

  // nav
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => setRoute(btn.dataset.route));
  });

  // auth
  const syncAuthMode = () => {
    $("authTitle").textContent = isRegisterMode ? "Register" : "Login";
    $("authSubmit").textContent = isRegisterMode ? "Register" : "Login";
    $("authToggle").textContent = isRegisterMode ? "Already have an account? Login" : "New here? Register";
  };
  syncAuthMode();

  $("authToggle").addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    $("authError").classList.add("hidden");
    syncAuthMode();
  });
  $("authSubmit").addEventListener("click", () => {
    const u = $("authUsername").value;
    const p = $("authPassword").value;
    const res = isRegisterMode ? User.register(u, p) : User.login(u, p);
    if (!res.ok) {
      $("authError").textContent = res.error;
      $("authError").classList.remove("hidden");
      return;
    }
    if (isRegisterMode) {
      // auto-login after register
      const loginRes = User.login(u, p);
      if (!loginRes.ok) return;
    }
    startSession();
  });

  $("logoutBtn").addEventListener("click", () => {
    Storage.clearSession();
    tracker = null;
    showAuth();
  });

  // salary category preference
  if ($("saveSalaryCategory")) {
    $("saveSalaryCategory").addEventListener("click", () => {
      if (!tracker) return;
      const v = ($("salaryCategory")?.value || "Salary").trim() || "Salary";
      localStorage.setItem(salaryKey(tracker.username), v);
      renderHome();
    });
  }
  if ($("saveRecurringSalary")) {
    $("saveRecurringSalary").addEventListener("click", () => {
      if (!tracker) return;
      const amount = Number($("salaryRecurringAmount")?.value || 0);
      const day = Number($("salaryRecurringDay")?.value || 1);
      const category = ($("salaryCategory")?.value || "Salary").trim() || "Salary";
      const msg = $("salaryRecurringMsg");

      if (!Number.isFinite(amount) || amount <= 0) {
        if (msg) msg.textContent = "Enter a valid recurring salary amount (> 0).";
        return;
      }
      if (!Number.isFinite(day) || day < 1 || day > 28) {
        if (msg) msg.textContent = "Payout day must be between 1 and 28.";
        return;
      }

      const nowMonth = monthKeyFromDate(new Date());
      saveRecurringSalary(tracker.username, {
        enabled: true,
        amount,
        day: Math.round(day),
        category,
        last_applied_month: nowMonth
      });

      // Apply for current month immediately if payout date has passed.
      const added = applyRecurringSalaryIfNeeded();
      if (msg) {
        msg.textContent = added > 0
          ? `Recurring salary saved. Added ${added} salary entr${added > 1 ? "ies" : "y"}.`
          : "Recurring salary saved.";
      }
      renderHome();
    });
  }

  // bank modal
  $("bankBtn").addEventListener("click", () => openBankModal());
  $("bankCloseX").addEventListener("click", () => closeBankModal());
  $("bankCloseBackdrop").addEventListener("click", () => closeBankModal());

  // bank details side panel
  const showDetails = () => $("bankDetailsPanel").classList.remove("hidden");
  const hideDetails = () => $("bankDetailsPanel").classList.add("hidden");
  $("bankDetailsToggle").addEventListener("click", () => {
    $("bankDetailsPanel").classList.toggle("hidden");
    $("bankDetailsError").classList.add("hidden");
  });
  $("bankDetailsClose").addEventListener("click", () => hideDetails());
  $("bankDisconnect").addEventListener("click", () => {
    if (!tracker) return;
    Storage.clearBank(tracker.username);
    renderBankStatus();
  });

  // bank choice + connect
  let selectedBankName = "HDFC";
  document.querySelectorAll(".bank-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedBankName = btn.dataset.bank || selectedBankName;
      document.querySelectorAll(".bank-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  // default highlight first
  const firstChoice = document.querySelector(".bank-choice");
  if (firstChoice) firstChoice.classList.add("active");

  $("bankConnectReal").addEventListener("click", () => {
    if (!tracker) return;
    // UI-only “connect”: stores selected bank for this user.
    setBankState({
      connected: true,
      connected_at: Date.now(),
      bank_name: selectedBankName,
      account_holder: tracker.username,
      account_mask: "XXXX-0000",
      ifsc: "",
      source: "ui"
    });
    $("bankMsg").textContent = `Selected ${selectedBankName}. Now import transactions below to populate your dashboard.`;
  });

  $("bankImport").addEventListener("click", async () => {
    $("bankImportError").classList.add("hidden");
    const file = $("bankCsv").files?.[0];
    if (!file) {
      $("bankImportError").textContent = "Please choose a CSV file first.";
      $("bankImportError").classList.remove("hidden");
      return;
    }
    const text = await file.text();
    const rows = parseCsv(text);
    const res = importBankRows(rows);
    if (!res.ok) {
      $("bankImportError").textContent = res.error;
      $("bankImportError").classList.remove("hidden");
      return;
    }
    $("bankMsg").textContent = `Imported ${res.imported} transactions from CSV.`;
  });

  $("bankSimulate").addEventListener("click", () => {
    $("bankImportError").classList.add("hidden");
    const st = bankState();
    if (!st?.connected) {
      $("bankImportError").textContent = "Connect bank (demo) first.";
      $("bankImportError").classList.remove("hidden");
      return;
    }
    // Simulate last 30 days expenses + 1 income.
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const samples = [
      { desc: "Swiggy order", amt: -220 },
      { desc: "Metro card recharge", amt: -150 },
      { desc: "Netflix subscription", amt: -199 },
      { desc: "Canteen", amt: -80 },
      { desc: "Fuel", amt: -300 },
      { desc: "Grocery store", amt: -420 },
      { desc: "Part-time payout", amt: 1200 }
    ];
    const rows = [];
    for (let i = 0; i < 22; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (i + 1));
      const s = samples[i % samples.length];
      rows.push({ date: iso(d), description: s.desc, amount: s.amt });
    }
    const res = importBankRows(rows);
    if (res.ok) $("bankMsg").textContent = `Simulated sync: imported ${res.imported} transactions.`;
  });

  $("bankDetailsImport").addEventListener("click", async () => {
    $("bankDetailsError").classList.add("hidden");
    const file = $("bankDetailsFile").files?.[0];
    if (!file) {
      $("bankDetailsError").textContent = "Please choose a JSON/CSV file first.";
      $("bankDetailsError").classList.remove("hidden");
      return;
    }
    const text = await file.text();
    const parsed = parseBankDetails(text, file.name);
    if (!parsed.ok) {
      $("bankDetailsError").textContent = parsed.error;
      $("bankDetailsError").classList.remove("hidden");
      return;
    }
    setBankState({
      connected: true,
      connected_at: Date.now(),
      ...parsed.details,
      source: "import"
    });
    $("bankMsg").textContent = "Bank account details imported and connected (display only).";
  });

  // add tx
  $("typeIncome").addEventListener("click", () => setAddType("income"));
  $("typeExpense").addEventListener("click", () => setAddType("expense"));
  $("addSubmit").addEventListener("click", () => {
    if (!tracker) return;
    const amount = Number($("txAmount").value);
    const category = ($("txCategory").value || "").trim();
    const date = $("txDate").value;
    const note = $("txNote").value || "";

    const err = validateAdd({ amount, category, date });
    if (err) {
      $("addError").textContent = err;
      $("addError").classList.remove("hidden");
      return;
    }
    $("addError").classList.add("hidden");
    tracker.add({ type: addType, amount, category, date, note });
    tracker.save();
    $("txAmount").value = "";
    $("txNote").value = "";
    setRoute("home");
  });
  $("addClear").addEventListener("click", () => {
    $("txAmount").value = "";
    $("txCategory").value = "";
    $("txNote").value = "";
    $("addError").classList.add("hidden");
  });

  // quick add on home
  $("qTypeIncome").addEventListener("click", () => setQuickType("income"));
  $("qTypeExpense").addEventListener("click", () => setQuickType("expense"));
  $("qAddSubmit").addEventListener("click", () => {
    if (!tracker) return;
    const amount = Number($("qAmount").value);
    const category = ($("qCategory").value || "").trim();
    const date = $("qDate").value;
    const note = $("qNote").value || "";

    const err = validateAdd({ amount, category, date });
    if (err) {
      $("qError").textContent = err;
      $("qError").classList.remove("hidden");
      return;
    }
    $("qError").classList.add("hidden");
    tracker.add({ type: quickType, amount, category, date, note });
    tracker.save();
    $("qAmount").value = "";
    $("qNote").value = "";
    renderAll();
  });
  $("qClear").addEventListener("click", () => {
    $("qAmount").value = "";
    $("qCategory").value = "";
    $("qNote").value = "";
    $("qError").classList.add("hidden");
  });
  $("goToAddPage").addEventListener("click", () => setRoute("add"));

  $("aiRefresh").addEventListener("click", () => renderAI());

  // default date
  $("txDate").value = Transaction.todayISO();
  $("qDate").value = Transaction.todayISO();
  setAddType("expense");
  setQuickType("expense");

  // session restore
  const sess = Storage.loadSession();
  if (sess && sess.username) startSession();
  else showAuth();

  // redraw charts on resize
  window.addEventListener("resize", () => renderAll());
}

function startSession() {
  const sess = Storage.loadSession();
  if (!sess?.username) { showAuth(); return; }
  tracker = new ExpenseTracker(sess.username);
  applyRecurringSalaryIfNeeded();
  showApp(sess.username);
  renderAll();
  renderBankStatus();
}

function validateAdd({ amount, category, date }) {
  if (!Number.isFinite(amount) || amount <= 0) return "Amount must be > 0.";
  if (!category) return "Category is required (e.g., Food, Rent, Travel).";
  if (!date) return "Date is required.";
  return null;
}

function setAddType(t) {
  addType = t;
  $("typeIncome").classList.toggle("active", t === "income");
  $("typeExpense").classList.toggle("active", t === "expense");
}

function setQuickType(t) {
  quickType = t;
  $("qTypeIncome").classList.toggle("active", t === "income");
  $("qTypeExpense").classList.toggle("active", t === "expense");
}

init();

