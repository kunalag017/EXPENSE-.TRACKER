## Expense Tracker (Full C++ Migration)

This project now includes a **full C++ web application** using **Drogon**:
- C++ controllers/routes
- C++ services for auth/transactions/reports/AI/salary/bank
- C++-rendered HTML pages (no dependency on `web/app.js` logic)

The original C++ desktop GUI (SFML + ImGui) and previous web/electron experiments are still present for reference, but the new migration target is the Drogon app.

### Features
- **User authentication**: Register/Login stored in `data/users.txt`
- **Per-user storage**: Each user has `data/<username>_transactions.csv`
- **Transactions**: Add, view, delete (income/expense)
- **Balance sheet**: total income, total expense, net balance + category breakdown + highlight highest spending
- **Time analysis**: weekly/monthly/yearly comparisons with % change and saved/extra spending
- **AI Advisor**: pattern insights, saving suggestions, next week/month predictions, and smart alerts
- **Charts**: Pie charts + bar charts (drawn directly in ImGui)

### Build C++ Drogon Web App (Windows)
Prereqs:
- **CMake** (3.27+)
- **Visual Studio 2022 Build Tools** (or VS 2022) with C++ workload
- **Git** (FetchContent downloads dependencies)

Build & run:

```bash
cmake -S . -B build_web -DBUILD_CPP_WEB=ON
cmake --build build_web --config Release --target expense_tracker_web
.\build_web\Release\expense_tracker_web.exe
```

Open:
- `http://localhost:8080`

### Demo Logins (Seeded by C++)
- `student_2yr` / `demo1234`
- `student_3yr` / `demo3456` (pre-connected to demo Axis bank)

### Notes
- Data is stored in local files under `data/` (auto-created).
- The app seeds demo users on startup if missing.
- Legacy targets still exist (`expense_tracker` desktop GUI, `web/`, `desktop/`).

---

## Web Version (Preview in Browser)

I also included a **pure website** version in `web/` (HTML/CSS/JS) with the same features:
auth, per-user transactions, analytics, charts, and AI-style suggestions. It runs instantly
with a local server (no compilation).

Run a preview server:

```bash
cd web
python -m http.server 5173
```

Open:
- `http://localhost:5173`

---

## Desktop App Version (Electron)

This wraps the `web/` website into a **desktop app** (Windows/macOS/Linux) using Electron.

### Run as an app (Windows)
Prereqs:
- **Node.js LTS** (install from `https://nodejs.org`)

Commands:

```bash
cd desktop
npm install
npm start
```

### Build a Windows installer (.exe)

```bash
cd desktop
npm install
npm run dist
```

The installer will be created under `desktop/dist/`.


