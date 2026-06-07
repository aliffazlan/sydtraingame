const http = require("http");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT = __dirname;
const STATIONS_FILE = path.join(ROOT, "stations.json");
const CONFIG_FILE = path.join(ROOT, "config.json");

function loadStartupConfig() {
  try {
    const raw = fsSync.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      editorEnabled: parsed.editorEnabled !== false
    };
  } catch {
    return { editorEnabled: true };
  }
}

const APP_CONFIG = loadStartupConfig();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function send(res, code, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(code, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function safePathFromUrl(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const relative = clean === "/" ? "/index.html" : clean;
  const absolute = path.normalize(path.join(ROOT, relative));
  if (!absolute.startsWith(ROOT)) return null;
  return absolute;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text);
}

function isRectPayload(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  return payload.every((row) =>
    row &&
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    row.rect &&
    Number.isFinite(row.rect.x) &&
    Number.isFinite(row.rect.y) &&
    Number.isFinite(row.rect.w) &&
    Number.isFinite(row.rect.h) &&
    (row.rect.angle === undefined || Number.isFinite(row.rect.angle))
  );
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url && req.url.startsWith("/api/config")) {
      return send(res, 200, JSON.stringify(APP_CONFIG), MIME[".json"]);
    }

    if (req.method === "GET" && req.url === "/api/stations") {
      const data = await fs.readFile(STATIONS_FILE, "utf8");
      return send(res, 200, data, MIME[".json"]);
    }

    if (req.method === "POST" && req.url === "/api/stations") {
      const payload = await readJsonBody(req);
      if (!isRectPayload(payload)) {
        return send(res, 400, JSON.stringify({ error: "Invalid payload shape" }), MIME[".json"]);
      }
      await fs.writeFile(STATIONS_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return send(res, 200, JSON.stringify({ ok: true, count: payload.length }), MIME[".json"]);
    }

    if (req.method !== "GET") {
      return send(res, 405, "Method not allowed");
    }

    const filePath = safePathFromUrl(req.url || "/");
    if (!filePath) return send(res, 403, "Forbidden");

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const data = await fs.readFile(filePath);
    return send(res, 200, data, mime);
  } catch (error) {
    if (error.code === "ENOENT") {
      return send(res, 404, "Not found");
    }
    if (error instanceof SyntaxError) {
      return send(res, 400, JSON.stringify({ error: "Invalid JSON body" }), MIME[".json"]);
    }
    return send(res, 500, JSON.stringify({ error: error.message }), MIME[".json"]);
  }
});

server.listen(PORT, () => {
  console.log(`Sydney quiz server running at http://localhost:${PORT}`);
});
