import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

const root = path.resolve("site");
const defaultPort = Number(process.env.PORT || process.env.SITE_PORT || 4173);
const host = process.env.SITE_HOST || "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"]
]);

function contentType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function safeResolve(requestPath) {
  const normalized = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const candidate = path.resolve(root, normalized || "index.html");
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function resolveAsset(requestPath) {
  const base = safeResolve(requestPath);
  if (!base) return null;

  if (await fileExists(base)) return base;

  if (!path.extname(base)) {
    const htmlCandidate = `${base}.html`;
    if (await fileExists(htmlCandidate)) return htmlCandidate;
    const indexCandidate = path.join(base, "index.html");
    if (await fileExists(indexCandidate)) return indexCandidate;
  }

  if (requestPath === "/") {
    const indexCandidate = path.join(root, "index.html");
    if (await fileExists(indexCandidate)) return indexCandidate;
  }

  return null;
}

async function serve(port) {
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const asset = await resolveAsset(requestUrl.pathname);

    if (!asset) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    try {
      const body = await readFile(asset);
      res.writeHead(200, {
        "Content-Type": contentType(asset),
        "Cache-Control": "no-store"
      });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Failed to read asset: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`Termif site dev server: http://${host}:${actualPort}/`);
  console.log("Mock release data is enabled automatically on localhost.");
}

async function start(port) {
  try {
    await serve(port);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
      await start(port + 1);
      return;
    }
    throw error;
  }
}

start(defaultPort).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
