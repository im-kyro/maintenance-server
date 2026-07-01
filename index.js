const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
app.use(express.json());

/* ── CORS ── */
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

const statePath = path.join(__dirname, "maintenance.json");
const ADMIN_CODE = "7400";

function ensureStateFile() {
    if (!fs.existsSync(statePath)) {
        const starter = {
            active: false,
            version: 1,
            announcement: { active: false, text: "" }
        };
        fs.writeFileSync(statePath, JSON.stringify(starter, null, 2));
        console.log("📄 Created starter maintenance.json");
    }
}
ensureStateFile();

function loadState() {
    let state;
    try {
        state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
        state = { active: false, version: 1 };
    }
    // Backfill announcement field for files created before this feature existed
    if (!state.announcement || typeof state.announcement !== "object") {
        state.announcement = { active: false, text: "" };
    }
    if (typeof state.announcement.active !== "boolean") state.announcement.active = false;
    if (typeof state.announcement.text !== "string") state.announcement.text = "";
    return state;
}
function saveState(state) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/* ── HEALTH CHECK ── */
app.get("/", (req, res) => res.send("MAINTENANCE API ONLINE"));
app.get("/ping", (req, res) => res.send("OK"));

/* ── GET MAINTENANCE STATUS (public — anyone can check) ── */
app.get("/api/maintenance", (req, res) => {
    const state = loadState();
    console.log("📡 STATUS CHECK:", state);
    res.json({ active: state.active, version: state.version });
});

/* ── TOGGLE MAINTENANCE (requires admin code) ── */
app.post("/api/maintenance/toggle", (req, res) => {
    const code = (req.body?.code || "").toString().trim();
    const desiredActive = req.body?.active;

    if (code !== ADMIN_CODE) {
        console.log("❌ TOGGLE DENIED — bad code");
        return res.status(403).json({ error: "INVALID_CODE" });
    }
    if (typeof desiredActive !== "boolean") {
        return res.status(400).json({ error: "MISSING_ACTIVE_BOOLEAN" });
    }

    const state = loadState();
    // Bump version only on the OFF -> ON transition.
    // This is what invalidates everyone's old bypass the next time
    // maintenance is turned on again.
    if (desiredActive === true && state.active === false) {
        state.version += 1;
    }
    state.active = desiredActive;
    saveState(state);
    console.log("🔧 TOGGLE OK — new state:", state);
    res.json({ active: state.active, version: state.version });
});

/* ── GET ANNOUNCEMENT (public — anyone can check) ── */
app.get("/api/announcement", (req, res) => {
    const state = loadState();
    console.log("📡 ANNOUNCEMENT CHECK:", state.announcement);
    res.json(state.announcement);
});

/* ── SET / PUBLISH ANNOUNCEMENT (requires admin code) ── */
app.post("/api/announcement/set", (req, res) => {
    const code = (req.body?.code || "").toString().trim();
    const text = (req.body?.text || "").toString().trim();

    if (code !== ADMIN_CODE) {
        console.log("❌ ANNOUNCEMENT SET DENIED — bad code");
        return res.status(403).json({ error: "INVALID_CODE" });
    }
    if (!text) {
        return res.status(400).json({ error: "MISSING_TEXT" });
    }

    const state = loadState();
    state.announcement = { active: true, text };
    saveState(state);
    console.log("📢 ANNOUNCEMENT SET:", state.announcement);
    res.json(state.announcement);
});

/* ── CLEAR ANNOUNCEMENT (requires admin code) ── */
app.post("/api/announcement/clear", (req, res) => {
    const code = (req.body?.code || "").toString().trim();

    if (code !== ADMIN_CODE) {
        console.log("❌ ANNOUNCEMENT CLEAR DENIED — bad code");
        return res.status(403).json({ error: "INVALID_CODE" });
    }

    const state = loadState();
    state.announcement = { active: false, text: "" };
    saveState(state);
    console.log("🧹 ANNOUNCEMENT CLEARED");
    res.json(state.announcement);
});

/* ── 404 ── */
app.use((req, res) => {
    res.status(404).json({ error: "NOT_FOUND", path: req.originalUrl });
});

const PORT = process.env.PORT || 15793;
app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 MAINTENANCE API RUNNING ON PORT", PORT);
});
