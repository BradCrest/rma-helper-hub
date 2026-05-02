#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 150;

function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= size) return [clean];

  const paragraphs = clean.split(/\n\s*\n/);
  const chunks = [];
  let buffer = "";

  for (const p of paragraphs) {
    if ((buffer + "\n\n" + p).length <= size) {
      buffer = buffer ? buffer + "\n\n" + p : p;
    } else {
      if (buffer) chunks.push(buffer);
      if (p.length <= size) {
        buffer = p;
      } else {
        let i = 0;
        while (i < p.length) {
          chunks.push(p.slice(i, i + size));
          i += size - overlap;
        }
        buffer = "";
      }
    }
  }

  if (buffer) chunks.push(buffer);
  return chunks.filter((c) => c.trim().length > 0);
}

function parseArgs(argv) {
  const args = {
    knowledgeDir: "../EOPI RMA Refine/knowledge",
    dryRun: false,
    replace: false,
    kickoff: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--knowledge-dir") {
      args.knowledgeDir = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--replace") {
      args.replace = true;
    } else if (arg === "--kickoff") {
      args.kickoff = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Import EOPI RMA markdown knowledge into LovableRMA email_knowledge_sources.

Usage:
  node scripts/import-eopi-email-knowledge.mjs [options]

Options:
  --knowledge-dir <path>  Path to the EOPI knowledge directory.
                          Default: ../EOPI RMA Refine/knowledge
  --dry-run              Print planned inserts without writing to Supabase.
  --replace              Replace existing imported rows with the same source_path.
  --kickoff              Call kickoff-email-embedding-job after successful import.
  -h, --help             Show this help.

Required environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

The script also reads .env.local and .env from the project root when present.`);
}

function loadDotEnv(projectRoot) {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(projectRoot, file);
    if (!existsSync(envPath)) continue;

    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function resolveProjectRoot() {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

async function collectSources(knowledgeDir) {
  const rootFiles = [
    { file: "faq.md", sourceType: "faq", tag: "CREST FAQ" },
    { file: "templates.md", sourceType: "template", tag: "回信模板" },
    { file: "signature.md", sourceType: "template", tag: "簽名檔" },
    { file: "style_examples.md", sourceType: "email", tag: "語氣範例" },
    { file: "playbook.md", sourceType: "document", tag: "SOP" },
    { file: "triage_rules.md", sourceType: "document", tag: "Triage" },
    { file: "contacts.md", sourceType: "document", tag: "聯絡人/政策" },
  ];

  const sources = rootFiles
    .map((item) => ({
      ...item,
      absPath: path.join(knowledgeDir, item.file),
      sourcePath: item.file,
      titleBase: item.file.replace(/\.md$/i, ""),
    }))
    .filter((item) => existsSync(item.absPath));

  const productsDir = path.join(knowledgeDir, "products");
  if (existsSync(productsDir)) {
    const productFiles = (await readdir(productsDir))
      .filter((file) => file.endsWith(".md"))
      .filter((file) => file !== "README.md" && file !== "_template.md")
      .sort();

    for (const file of productFiles) {
      const productName = file.replace(/\.md$/i, "");
      sources.push({
        file: `products/${file}`,
        sourceType: "document",
        tag: `產品:${productName}`,
        absPath: path.join(productsDir, file),
        sourcePath: `products/${file}`,
        titleBase: `產品 ${productName}`,
      });
    }
  }

  return sources;
}

async function findExistingRows(supabase, sourcePath) {
  const { data, error } = await supabase
    .from("email_knowledge_sources")
    .select("id, title, metadata")
    .contains("metadata", { source_path: sourcePath })
    .limit(1000);

  if (error) throw error;
  return data ?? [];
}

async function kickoffEmbeddingJob(supabaseUrl, serviceKey) {
  const response = await fetch(`${supabaseUrl}/functions/v1/kickoff-email-embedding-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ triggerSource: "manual" }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || json?.error || `Embedding kickoff failed: ${response.status}`);
  }
  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const projectRoot = resolveProjectRoot();
  loadDotEnv(projectRoot);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!args.dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.");
  }

  const knowledgeDir = path.resolve(projectRoot, args.knowledgeDir);
  if (!existsSync(knowledgeDir)) {
    throw new Error(`Knowledge directory not found: ${knowledgeDir}`);
  }

  const importBatch = new Date().toISOString();
  const sources = await collectSources(knowledgeDir);
  const planned = [];

  for (const source of sources) {
    const content = readFileSync(source.absPath, "utf8");
    const sourceHash = sha256(content);
    const chunks = chunkText(content);

    planned.push({
      ...source,
      content,
      sourceHash,
      chunks,
      rows: chunks.map((chunk, index) => ({
        source_type: source.sourceType,
        title: chunks.length === 1 ? source.titleBase : `${source.titleBase} (${index + 1}/${chunks.length})`,
        content: chunk,
        metadata: {
          language: "zh-TW",
          tag: source.tag,
          source_path: source.sourcePath,
          source_hash: sourceHash,
          import_batch: importBatch,
          imported_by: "scripts/import-eopi-email-knowledge.mjs",
          chunk_index: index,
          total_chunks: chunks.length,
        },
      })),
    });
  }

  console.log(`Knowledge dir: ${knowledgeDir}`);
  console.log(`Sources found: ${planned.length}`);
  console.log(`Rows planned: ${planned.reduce((sum, source) => sum + source.rows.length, 0)}`);

  for (const source of planned) {
    console.log(`- ${source.sourcePath}: ${source.rows.length} row(s), type=${source.sourceType}, tag=${source.tag}`);
  }

  if (args.dryRun) {
    console.log("Dry run only. No database writes performed.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let inserted = 0;
  let skipped = 0;
  let replaced = 0;

  for (const source of planned) {
    const existing = await findExistingRows(supabase, source.sourcePath);
    const hasSameHash = existing.some((row) => row.metadata?.source_hash === source.sourceHash);

    if (existing.length > 0 && hasSameHash && !args.replace) {
      skipped += source.rows.length;
      console.log(`Skipped unchanged source: ${source.sourcePath}`);
      continue;
    }

    if (existing.length > 0 && !args.replace) {
      skipped += source.rows.length;
      console.log(`Skipped changed source without --replace: ${source.sourcePath}`);
      continue;
    }

    if (existing.length > 0 && args.replace) {
      const ids = existing.map((row) => row.id);
      const { error } = await supabase.from("email_knowledge_sources").delete().in("id", ids);
      if (error) throw error;
      replaced += ids.length;
      console.log(`Deleted ${ids.length} existing row(s): ${source.sourcePath}`);
    }

    const { data, error } = await supabase
      .from("email_knowledge_sources")
      .insert(source.rows)
      .select("id");

    if (error) throw error;
    inserted += data?.length ?? 0;
    console.log(`Inserted ${data?.length ?? 0} row(s): ${source.sourcePath}`);
  }

  console.log(`Import complete. inserted=${inserted}, skipped=${skipped}, replaced=${replaced}`);

  if (args.kickoff && inserted > 0) {
    const result = await kickoffEmbeddingJob(supabaseUrl, serviceKey);
    console.log(`Embedding kickoff: ${result.message || JSON.stringify(result)}`);
  } else if (inserted > 0) {
    console.log("Embedding rows are pending via DB trigger. Run with --kickoff to start indexing immediately.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
