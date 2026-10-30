#!/usr/bin/env python3
"""Generate Desa Komen art with Bumi; resume saved jobs without spending on a new POST."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import time
import hashlib
from urllib.error import HTTPError, URLError
from urllib.request import Request, HTTPRedirectHandler, build_opener, urlopen

BASE = "https://bumi.digital"
MODEL = "google/nano-banana-2.1"
SIZES = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("Authenticated redirect refused; key was not forwarded")


def clean(value, key=""):
    text = str(value).replace(key, "[REDACTED]") if key else str(value)
    return re.sub(r"(?:bd_|sk-)[A-Za-z0-9_-]{16,}", "[REDACTED]", text)[:1000]


def api(path, key, body=None):
    target = BASE + path
    headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    if body is not None:
        fingerprint = hashlib.sha256((path + json.dumps(body, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()[:32]
        headers["Idempotency-Key"] = "desa-komen-" + fingerprint
    request = Request(target,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers=headers,
                      method="POST" if body is not None else "GET")
    try:
        with build_opener(NoRedirect).open(request, timeout=240) as response:
            data = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"Bumi HTTP {exc.code}: {clean(exc.read().decode('utf-8', 'replace'), key)}") from None
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected API response type")
    if data.get("ok") is False:
        raise RuntimeError(clean(data.get("error") or data.get("message") or "API rejected request", key))
    return data


def unwrap(data):
    return data["data"] if isinstance(data.get("data"), dict) else data


def image_url(data):
    for field in ("url", "result_url", "resultUrl", "image_url"):
        value = data.get(field)
        if isinstance(value, str) and value.startswith("https://"):
            return value
    for field in ("result_urls", "urls", "images"):
        values = data.get(field)
        if isinstance(values, list) and values:
            value = values[0]
            value = value.get("url") if isinstance(value, dict) else value
            if isinstance(value, str) and value.startswith("https://"):
                return value
    return None


def write_manifest(path, data):
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def credential():
    key = os.environ.get("BUMI_API_KEY", "")
    if not key:
        # Credential source explicitly configured by create-image-bd/SKILL.md; never copied into the project.
        text = Path("/Users/yughoz/Documents/Obsidian Vault/Macbook/KEYS/keys.md").read_text()
        for match in re.finditer("BUMI_API_KEY", text):
            token = re.search(r"\bbd_[A-Za-z0-9_-]+", text[match.end():match.end() + 350])
            if token:
                key = token.group(0)
                os.environ["BUMI_API_KEY"] = key
                break
    if not key:
        raise RuntimeError("BUMI_API_KEY unavailable in the skill-configured credential source")
    return key


def preflight(key, model_id=MODEL):
    response = api("/api/v1/models?type=image", key)
    catalog = response.get("data", response.get("models", []))
    if isinstance(catalog, dict):
        catalog = catalog.get("models", [])
    if not isinstance(catalog, list) or not any(isinstance(model, dict) and model.get("model_id") == model_id for model in catalog):
        raise RuntimeError(f"Authenticated catalog does not include {model_id}; no generation submitted. Repair the catalog before continuing.")


def generation(identifier, key):
    jobs = api("/api/v1/generations?type=image&limit=50", key).get("data", [])
    if not isinstance(jobs, list):
        raise RuntimeError("Unexpected generation history format; no new POST will be submitted")
    return next((job for job in jobs if str(job.get("id")) == identifier), {"id": identifier, "status": "processing"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt-file", type=Path, help="UTF-8 text prompt; required for a new generation")
    parser.add_argument("--output", type=Path, help="Asset directory; required except for --history")
    parser.add_argument("--size", choices=SIZES, default="1:1")
    parser.add_argument("--resolution", choices=["1K", "2K", "4K"], default="2K")
    parser.add_argument("--model", default=MODEL, help="Exact model ID from the authenticated Bumi catalog")
    parser.add_argument("--quality", choices=["low", "medium", "high", "xhigh", "max"])
    parser.add_argument("--reference", action="append", default=[], help="Reference HTTPS image URL; repeat up to 10 times")
    parser.add_argument("--timeout", type=int, default=600, help="Polling deadline in seconds")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--history", action="store_true", help="Read recent jobs; never starts a generation")
    modes.add_argument("--resume", metavar="ID", help="Read/download an existing job; never starts a generation")
    parser.add_argument("--dry-run", action="store_true", help="Validate settings without network, key, or output writes")
    args = parser.parse_args()
    if not args.history and args.output is None:
        parser.error("--output is required")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if not args.history and not args.resume and args.prompt_file is None:
        parser.error("--prompt-file is required for a new generation")
    prompt = args.prompt_file.read_text(encoding="utf-8").strip() if args.prompt_file else None
    if prompt is not None and not prompt:
        parser.error("Prompt is empty")
    parameters = {"prompt": prompt, "size": args.size, "resolution": args.resolution}
    if args.quality:
        parameters["quality"] = args.quality
    if len(args.reference) > 10:
        parser.error("At most 10 reference images are supported")
    references = []
    for reference in args.reference:
        if not reference.startswith("https://"):
            parser.error("References must be HTTPS URLs; Bumi cannot fetch local data URLs")
        references.append(reference)
    if references:
        parameters["image_urls"] = references
    if args.dry_run:
        print(json.dumps({"mode": "history" if args.history else "resume" if args.resume else "generate",
                          "model": args.model, "generation_id": args.resume,
                          "parameters": parameters, "output": str(args.output) if args.output else None,
                          "network_requests": 0}, ensure_ascii=False, indent=2))
        return 0
    key = credential()
    if args.history:
        jobs = api("/api/v1/generations?type=image&limit=20", key).get("data", [])
        if not isinstance(jobs, list):
            raise RuntimeError("Unexpected history format")
        print(json.dumps([{field: job.get(field) for field in ("id", "model", "status", "created_at", "credits_used")}
                          for job in jobs if job.get("model") == args.model], indent=2))
        return 0
    args.output.mkdir(parents=True, exist_ok=True)
    identifier = args.resume
    if identifier:
        result = generation(identifier, key)
        if result.get("model", result.get("model_id", args.model)) != args.model:
            raise RuntimeError("Resume job uses a different model; no files changed and no generation submitted")
    else:
        preflight(key, args.model)
        try:
            # One POST only: a timeout does not prove the job was rejected.
            result = unwrap(api("/api/v1/image/generate", key, {"model_id": args.model, "parameters": parameters}))
        except (RuntimeError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"{clean(exc, key)}. No automatic POST retry. Use --history, then --resume ID.") from None
        identifier = result.get("generation_id") or result.get("id")
    if not identifier:
        raise RuntimeError("No generation ID returned. Do not repeat POST; use --history to recover the existing job")
    identifier = str(identifier)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", identifier)
    manifest_path = args.output / f"generation-{safe_id}.json"
    metadata = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if args.resume:
        parameters = metadata.get("parameters", {k: v for k, v in parameters.items() if v is not None})
        if result.get("prompt"):
            parameters["prompt"] = result["prompt"]
        if result.get("aspectRatio"):
            parameters["size"] = result["aspectRatio"]
    metadata.update({"provider": "Bumi Digital", "model": args.model, "generation_id": identifier,
                     "parameters": parameters, "status": result.get("status", "processing"),
                     "documentation": BASE + "/api-docs/image"})
    write_manifest(manifest_path, metadata)
    print(json.dumps({"generation_id": identifier, "status": metadata["status"], "manifest": str(manifest_path)}), flush=True)
    started = time.monotonic()
    while True:
        metadata.update({"status": result.get("status", "processing")})
        credits = result.get("used_cost", result.get("credits_used", result.get("creditsUsed")))
        if credits is not None:
            metadata["credits_used"] = credits
        write_manifest(manifest_path, metadata)
        url = image_url(result)
        if url:
            break
        if result.get("status") in ("failed", "error", "cancelled"):
            raise RuntimeError(clean(result.get("error") or "Generation failed", key))
        if time.monotonic() - started >= args.timeout:
            raise RuntimeError(f"Still pending. Resume with --resume {identifier}; do not submit a new generation")
        time.sleep(5)
        try:
            result = generation(identifier, key)
        except (RuntimeError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"{clean(exc, key)}. Resume with --resume {identifier}; job is saved in {manifest_path}") from None
    try:
        # Result hosts receive no Authorization header.
        with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"}), timeout=180) as response:
            content = response.read()
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Download failed: {clean(exc, key)}. Resume with --resume {identifier}; no new POST is needed") from None
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        extension = ".png"
    elif content.startswith(b"\xff\xd8\xff"):
        extension = ".jpg"
    elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        extension = ".webp"
    else:
        raise RuntimeError(f"Result is not a PNG/JPEG/WebP. Recover with --resume {identifier}")
    destination = args.output / f"generated-{safe_id}{extension}"
    temporary = destination.with_suffix(extension + ".tmp")
    temporary.write_bytes(content)
    temporary.replace(destination)
    metadata.update({"downloaded_file": destination.name, "bytes": len(content)})
    write_manifest(manifest_path, metadata)
    print(json.dumps({"output": str(destination), "status": metadata["status"], "bytes": len(content)}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError) as exc:
        print("Error: " + clean(exc, os.environ.get("BUMI_API_KEY", "")), file=sys.stderr)
        raise SystemExit(1)
