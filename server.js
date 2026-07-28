"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const simulation = require("./simulation.js");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_BODY_SIZE = 2 * 1024 * 1024;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJSON(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

function readJSONBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    request.setEncoding("utf8");
    request.on("data", chunk => {
      if (oversized) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        oversized = true;
        const error = new Error("İstek gövdesi çok büyük.");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
      }
    });
    request.on("end", () => {
      if (oversized) return;
      if (!body.trim()) return reject(Object.assign(new Error("JSON istek gövdesi gereklidir."), { code: "EMPTY_BODY" }));
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(Object.assign(new Error("İstek gövdesi geçerli JSON değil."), { code: "INVALID_JSON" }));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== path.join(ROOT, "index.html")) {
    return sendJSON(response, 403, { status: "error", message: "Bu dosyaya erişilemez.", error_code: "FORBIDDEN" });
  }
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      return sendJSON(response, 404, { status: "error", message: "Kaynak bulunamadı.", error_code: "NOT_FOUND" });
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-cache"
    });
    if (request.method === "HEAD") return response.end();
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return response.end();
  }

  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/api/health" && request.method === "GET") {
    return sendJSON(response, 200, { status: "ok", service: "yarin-life-simulation", api_version: simulation.version });
  }

  if (pathname === "/api/simulate" && request.method === "POST") {
    try {
      const payload = await readJSONBody(request);
      const result = simulation.handleRequest(payload);
      return sendJSON(response, 200, result);
    } catch (error) {
      const tooLarge = error.code === "PAYLOAD_TOO_LARGE";
      return sendJSON(response, tooLarge ? 413 : 400, {
        status: "error",
        message: error.message || "İstek işlenemedi.",
        error_code: error.code || "BAD_REQUEST",
        current_game_state: null
      });
    }
  }

  if (pathname.startsWith("/api/")) {
    return sendJSON(response, 404, { status: "error", message: "API uç noktası bulunamadı.", error_code: "API_NOT_FOUND" });
  }

  if (request.method === "GET" || request.method === "HEAD") return serveStatic(request, response);
  return sendJSON(response, 405, { status: "error", message: "HTTP metodu desteklenmiyor.", error_code: "METHOD_NOT_ALLOWED" });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Yarın yaşam simülasyonu http://localhost:${PORT} adresinde çalışıyor.`);
  });
}

module.exports = server;
