import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, randomBytes, timingSafeEqual, createHmac, randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const usersFile = join(dataDir, "auth-users.json");
const secretFile = join(dataDir, "auth-secret.txt");
const port = Number(process.env.AUTH_PORT || 4000);

const seedUsers = [
  { name: "Aarav Mehta", email: "patient@cureus.local", password: "patient123", role: "Patient" },
  { name: "Dr. Meera Iyer", email: "doctor@cureus.local", password: "doctor123", role: "Doctor" },
  { name: "Admin Reviewer", email: "admin@cureus.local", password: "admin123", role: "Admin" }
];

const roleAccess = {
  Patient: ["landing", "chat", "report"],
  Doctor: ["landing", "chat", "report", "doctor"],
  Admin: ["landing", "chat", "report", "doctor", "admin"]
};

function ensureData() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(48).toString("hex"));
  if (!existsSync(usersFile)) {
    const users = seedUsers.map((user) => createUserRecord(user));
    writeJson(usersFile, users);
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const candidate = hashPassword(password, user.salt).hash;
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function createUserRecord({ name, email, password, role }) {
  const { salt, hash } = hashPassword(password);
  return {
    id: randomUUID(),
    name,
    email: email.toLowerCase(),
    role,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    access: roleAccess[user.role] || roleAccess.Patient
  };
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signToken(user) {
  const secret = readFileSync(secretFile, "utf8");
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const secret = readFileSync(secretFile, "utf8");
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
  return decoded;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "http://127.0.0.1:5173",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(body));
}

function getBearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

ensureData();

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  try {
    if (req.url === "/api/health" && req.method === "GET") {
      return send(res, 200, { ok: true });
    }

    if (req.url === "/api/auth/login" && req.method === "POST") {
      const { email, password } = await readBody(req);
      const users = readJson(usersFile, []);
      const user = users.find((item) => item.email === String(email || "").toLowerCase());
      if (!user || !verifyPassword(String(password || ""), user)) {
        return send(res, 401, { ok: false, message: "Invalid email or password." });
      }
      return send(res, 200, { ok: true, user: publicUser(user), token: signToken(user) });
    }

    if (req.url === "/api/auth/register" && req.method === "POST") {
      const { name, email, password } = await readBody(req);
      if (!name || !email || !password || String(password).length < 8) {
        return send(res, 400, { ok: false, message: "Name, email, and password with 8+ characters are required." });
      }
      const users = readJson(usersFile, []);
      if (users.some((item) => item.email === String(email).toLowerCase())) {
        return send(res, 409, { ok: false, message: "Email already registered." });
      }
      const user = createUserRecord({ name, email, password, role: "Patient" });
      users.push(user);
      writeJson(usersFile, users);
      return send(res, 201, { ok: true, user: publicUser(user), token: signToken(user) });
    }

    if (req.url === "/api/auth/me" && req.method === "GET") {
      const decoded = verifyToken(getBearer(req));
      if (!decoded) return send(res, 401, { ok: false, message: "Session expired." });
      const users = readJson(usersFile, []);
      const user = users.find((item) => item.id === decoded.sub);
      if (!user) return send(res, 401, { ok: false, message: "User not found." });
      return send(res, 200, { ok: true, user: publicUser(user) });
    }

    if (req.url === "/api/auth/logout" && req.method === "POST") {
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { ok: false, message: "Not found." });
  } catch (error) {
    return send(res, 500, { ok: false, message: error.message || "Server error." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CureUs auth server running at http://127.0.0.1:${port}`);
});
