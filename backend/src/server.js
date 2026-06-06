import "dotenv/config";

import cors from "cors";
import express from "express";
import * as dagJson from "@ipld/dag-json";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

const PORT = Number(process.env.PORT || 3000);
const KUBO_API_URL = normalizeBaseUrl(process.env.KUBO_API_URL || "http://127.0.0.1:5001");
const REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || "64kb";
const MAX_TITLE_LENGTH = Number(process.env.MAX_TITLE_LENGTH || 200);
const MAX_BODY_LENGTH = Number(process.env.MAX_BODY_LENGTH || 50000);

const app = express();

app.use(cors({ origin: parseCorsOrigin(process.env.CORS_ORIGIN || "http://localhost:4200") }));
app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", kuboApiUrl: KUBO_API_URL });
});

app.post("/api/ipfs/pin", async (req, res, next) => {
  try {
    const content = validateContent(req.body);
    const { block, cid, bytes32 } = await buildDagJsonBlock(content);

    validateExpectedDigest(req.body, cid, bytes32);

    const kuboCid = await pinBlockToKubo(block);
    if (!cidsEqual(kuboCid, cid)) {
      throw httpError(
        502,
        `Kubo returned CID ${kuboCid}, expected ${cid}. Check Kubo block codec/hash options.`,
      );
    }

    res.json({ cid, bytes32 });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const status = Number.isInteger(err.statusCode)
    ? err.statusCode
    : Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: err.message || "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(`Forum IPFS backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Using Kubo API at ${KUBO_API_URL}`);
});

function parseCorsOrigin(value) {
  if (!value || value.trim() === "*") return true;
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function validateContent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw httpError(400, "JSON body must be an object");
  }

  const { title, body } = input;
  if (typeof title !== "string") throw httpError(400, "title must be a string");
  if (typeof body !== "string") throw httpError(400, "body must be a string");
  if (body.trim().length === 0) throw httpError(400, "body must not be empty");
  if (title.length > MAX_TITLE_LENGTH) throw httpError(400, `title exceeds ${MAX_TITLE_LENGTH} characters`);
  if (body.length > MAX_BODY_LENGTH) throw httpError(400, `body exceeds ${MAX_BODY_LENGTH} characters`);

  // Preserve property order used by the frontend before encoding to DAG-JSON.
  return { title, body };
}

async function buildDagJsonBlock(content) {
  const block = dagJson.encode(content);
  const hash = await sha256.digest(block);
  const cid = CID.createV1(dagJson.code, hash);
  return {
    block,
    cid: cid.toString(),
    bytes32: cidToBytes32(cid),
  };
}

function cidToBytes32(cid) {
  const digest = cid.multihash.digest;
  return `0x${Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function validateExpectedDigest(input, cid, bytes32) {
  if (input.cid !== undefined && !cidsEqual(String(input.cid), cid)) {
    throw httpError(400, `CID mismatch: frontend sent ${input.cid}, server computed ${cid}`);
  }

  if (input.bytes32 !== undefined && String(input.bytes32).toLowerCase() !== bytes32) {
    throw httpError(400, `bytes32 mismatch: frontend sent ${input.bytes32}, server computed ${bytes32}`);
  }
}

function cidsEqual(left, right) {
  try {
    return CID.parse(left).toString() === CID.parse(right).toString();
  } catch (_err) {
    return left === right;
  }
}

async function pinBlockToKubo(block) {
  const attempts = [
    new URLSearchParams({ "cid-codec": "dag-json", mhtype: "sha2-256", pin: "true" }),
    new URLSearchParams({ format: "dag-json", mhtype: "sha2-256", pin: "true" }),
  ];
  const errors = [];

  for (const params of attempts) {
    const result = await tryPutBlock(params, block);
    if (result.ok) return result.cid;
    errors.push(result.error);
  }

  throw httpError(502, `Kubo block put failed: ${errors.join("; ")}`);
}

async function tryPutBlock(params, block) {
  const form = new FormData();
  form.append("file", new Blob([block], { type: "application/octet-stream" }), "content.dag-json");

  let response;
  try {
    response = await fetch(`${KUBO_API_URL}/api/v0/block/put?${params.toString()}`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    return { ok: false, error: `could not reach ${KUBO_API_URL}: ${err.message}` };
  }

  const text = await response.text();
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status} ${compact(text)}` };
  }

  try {
    const payload = JSON.parse(text);
    const cid = payload.Key ?? payload.Hash ?? payload.Cid?.["/"] ?? payload.Cid;
    if (typeof cid !== "string" || cid.length === 0) {
      return { ok: false, error: `unexpected Kubo response ${compact(text)}` };
    }
    return { ok: true, cid };
  } catch (_err) {
    return { ok: false, error: `invalid Kubo JSON response ${compact(text)}` };
  }
}

function compact(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > 300 ? `${cleaned.slice(0, 300)}...` : cleaned;
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
