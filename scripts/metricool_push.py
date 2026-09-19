#!/usr/bin/env python3
"""Hantar barisan post SkripGun ke Metricool Scheduler API.

Input: fail JSON yang di-download dari SkripGun (tab 3 -> "Download JSON").

Auth (Metricool API ada pada plan berbayar tertentu sahaja):
    export METRICOOL_USER_TOKEN=...   # header X-Mc-Auth
    export METRICOOL_USER_ID=...
    export METRICOOL_BLOG_ID=...      # id brand

Guna:
    python3 scripts/metricool_push.py skripgun-queue.json            # dry-run, cuma cetak request
    python3 scripts/metricool_push.py skripgun-queue.json --send     # betul-betul jadual
    python3 scripts/metricool_push.py --brands                       # senarai brand + blogId

PENTING: bentuk endpoint/body Metricool boleh berubah dan dokumentasi rasmi
(app.metricool.com/resources/apidocs) tak dapat dibaca masa skrip ni ditulis.
Kalau dapat 4xx, banding dengan doc kau dan tukar --path atau pemetaan dalam
build_payload(). Kalau plan kau tiada API, guna CSV import dalam Metricool
Calendar (jalan pada semua plan) -- itu laluan default SkripGun.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API_BASE = os.environ.get("METRICOOL_API_BASE", "https://app.metricool.com/api")
SCHEDULER_PATH = "/v2/scheduler/posts"
BRANDS_PATH = "/admin/simpleProfiles"

NETWORK_MAP = {
    "tiktok": "tiktok",
    "instagram": "instagram",
    "threads": "threads",
    "facebook": "facebook",
    "twitter": "twitter",
    "linkedin": "linkedin",
    "youtube": "youtube",
    "pinterest": "pinterest",
    "bluesky": "bluesky",
    "gmb": "gmb",
}


def env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        sys.exit(f"[x] {name} tak di-set. Rujuk docstring skrip ni.")
    return val


def request(method: str, path: str, params: dict, body: dict | None = None) -> tuple[int, str]:
    url = f"{API_BASE}{path}?{urllib.parse.urlencode(params)}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-Mc-Auth", env("METRICOOL_USER_TOKEN"))
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        sys.exit(f"[x] Tak dapat sambung: {e.reason}")


def build_payload(post: dict, timezone: str) -> dict:
    network = NETWORK_MAP.get(str(post.get("network", "")).lower())
    if not network:
        raise ValueError(f"network tak dikenali: {post.get('network')!r}")
    date, time = post.get("date"), post.get("time")
    if not date or not time:
        raise ValueError("post tiada tarikh/masa -- susun slot dalam SkripGun dulu")
    provider: dict = {"network": network}
    if post.get("type"):
        provider["type"] = post["type"]
    payload = {
        "providers": [provider],
        "publicationDate": {"dateTime": f"{date}T{time}:00", "timezone": timezone},
        "text": post.get("text", ""),
        "autoPublish": True,
        "draft": False,
    }
    media = [m for m in post.get("media") or [] if m]
    if media:
        payload["media"] = media
    return payload


def main() -> None:
    ap = argparse.ArgumentParser(description="Jadual post SkripGun ke Metricool.")
    ap.add_argument("queue", nargs="?", help="fail JSON dari SkripGun")
    ap.add_argument("--send", action="store_true", help="betul-betul hantar (default: dry-run)")
    ap.add_argument("--brands", action="store_true", help="senarai brand + blogId")
    ap.add_argument("--draft", action="store_true", help="hantar sebagai draf, bukan auto-publish")
    ap.add_argument("--path", default=SCHEDULER_PATH, help=f"override path scheduler (default {SCHEDULER_PATH})")
    args = ap.parse_args()

    if args.brands:
        status, body = request("GET", BRANDS_PATH, {"userId": env("METRICOOL_USER_ID")})
        print(status, body[:4000])
        return

    if not args.queue:
        ap.error("bagi fail JSON, atau guna --brands")

    with open(args.queue, encoding="utf-8") as f:
        data = json.load(f)
    timezone = data.get("timezone") or "Asia/Kuala_Lumpur"
    posts = data.get("posts") or []
    if not posts:
        sys.exit("[x] Tiada post dalam fail tu.")

    params = {"blogId": env("METRICOOL_BLOG_ID"), "userId": env("METRICOOL_USER_ID")} if args.send else {}
    ok = fail = 0
    for i, post in enumerate(posts, 1):
        try:
            payload = build_payload(post, timezone)
        except ValueError as e:
            print(f"[{i}] skip -- {e}")
            fail += 1
            continue
        if args.draft:
            payload["draft"] = True
            payload["autoPublish"] = False
        label = f"{payload['providers'][0]['network']} @ {payload['publicationDate']['dateTime']}"
        if not args.send:
            print(f"[{i}] DRY-RUN POST {API_BASE}{args.path}  ({label})")
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            continue
        status, body = request("POST", args.path, params, payload)
        if 200 <= status < 300:
            ok += 1
            print(f"[{i}] ok {status} -- {label}")
        else:
            fail += 1
            print(f"[{i}] GAGAL {status} -- {label}\n     {body[:500]}")

    if args.send:
        print(f"\nSiap: {ok} berjaya, {fail} gagal.")
    else:
        print(f"\nDry-run habis ({len(posts)} post). Tambah --send bila kau dah puas hati.")


if __name__ == "__main__":
    main()
