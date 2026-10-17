#!/usr/bin/env python3
"""End-to-end smoke test for local-backend.

By default it starts its own uvicorn on a spare port with a throwaway DATA_DIR,
runs every check, then stops the server and deletes the data.
  --base http://localhost:5173   test a running server instead (e.g. through the Vite proxy)
  --no-ai                        skip the Vertex/Gemini calls
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time, uuid
import urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIX = Path(__file__).resolve().parent / "fixtures"
DESKTOP = Path.home() / "Desktop"
SAMPLE_PDF = DESKTOP / "Software-Client-Server-and-REST-APIs" / "Client-Server-and-REST-APIs-Lecture-Handout-CS230.pdf"
SAMPLE_JPG = DESKTOP / "Economics-Supply-and-Demand" / "Handwritten-Notes-Supply-Demand-Basics.jpg"

results: list[tuple[str, bool, str, float]] = []


def req(base, method, path, body=None, headers=None, raw=None):
    h = dict(headers or {})
    data = raw
    if body is not None:
        data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    r = urllib.request.Request(base + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        txt = e.read()
        try: return e.code, json.loads(txt)
        except Exception: return e.code, txt.decode(errors="replace")


def multipart(base, path, name, content, ctype):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{b}--\r\n".encode()
    return req(base, "POST", path, raw=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})


def check(name, fn):
    t = time.time()
    try:
        ok, detail = fn()
    except Exception as e:  # noqa: BLE001
        ok, detail = False, f"{type(e).__name__}: {e}"
    dt = time.time() - t
    results.append((name, ok, detail, dt))
    print(f"{'PASS' if ok else 'FAIL'}  {dt:6.2f}s  {name}  {detail[:160]}", flush=True)
    return ok


def run(base, ai):
    uid = "local-user"
    check("health", lambda: ((s := req(base, "GET", "/api/health"))[0] == 200 and s[1]["ok"], f"ai={s[1].get('ai')}"))
    check("me (stub user)", lambda: ((s := req(base, "GET", "/api/me"))[0] == 200 and s[1]["uid"] == uid, str(s[1])))
    check("me with X-User-Id", lambda: ((s := req(base, "GET", "/api/me", headers={"X-User-Id": "alice"}))[1]["uid"] == "alice", str(s[1])))

    pdf = SAMPLE_PDF.read_bytes() if SAMPLE_PDF.exists() else b"%PDF-1.1\n%%EOF\n"
    up = {}
    def upload_ok():
        s, b = multipart(base, "/api/uploads", "lecture.pdf", pdf, "application/pdf")
        up.update(b if isinstance(b, dict) else {})
        return s == 200 and b["size"] == len(pdf) and b["content_type"] == "application/pdf", f"{s} id={b.get('id')}"
    check("upload valid PDF", upload_ok)
    check("upload stored as doc", lambda: ((s := req(base, "GET", f"/api/docs/users/{uid}/uploads/{up.get('id')}"))[0] == 200, str(s[0])))
    check("upload oversize -> 413", lambda: ((s := multipart(base, "/api/uploads", "big.pdf", b"0" * (20 * 1024 * 1024 + 1), "application/pdf"))[0] == 413, str(s)))
    check("upload missing file -> 422", lambda: ((s := req(base, "POST", "/api/uploads", raw=b"", headers={"Content-Type": "multipart/form-data; boundary=x"}))[0] in (400, 422), str(s[0])))
    check("upload empty file -> 400", lambda: ((s := multipart(base, "/api/uploads", "empty.pdf", b"", "application/pdf"))[0] == 400, str(s)))

    d = f"/api/docs/users/{uid}/smoke"
    check("doc put", lambda: ((s := req(base, "PUT", f"{d}/a", {"x": 1, "y": 2}))[0] == 200, str(s)))
    check("doc get", lambda: ((s := req(base, "GET", f"{d}/a"))[0] == 200 and s[1]["data"] == {"x": 1, "y": 2}, str(s)))
    check("doc merge", lambda: ((req(base, "PUT", f"{d}/a?merge=true", {"y": 3, "z": 4}), s := req(base, "GET", f"{d}/a"))[1][1]["data"] == {"x": 1, "y": 3, "z": 4}, str(s[1])))
    check("doc replace (no merge)", lambda: ((req(base, "PUT", f"{d}/a", {"only": True}), s := req(base, "GET", f"{d}/a"))[1][1]["data"] == {"only": True}, str(s[1])))
    check("collection list", lambda: ((req(base, "PUT", f"{d}/b", {"n": 2}), s := req(base, "GET", d))[1][0] == 200 and {x["id"] for x in s[1]["docs"]} == {"a", "b"}, str(s[1])))
    check("doc delete", lambda: ((s := req(base, "DELETE", f"{d}/a"))[1]["deleted"] is True and req(base, "GET", f"{d}/a")[0] == 404, str(s)))
    check("doc missing -> 404", lambda: ((s := req(base, "GET", f"{d}/nope"))[0] == 404, str(s[0])))
    check("doc odd path PUT -> 400", lambda: ((s := req(base, "PUT", d, {"x": 1}))[0] == 400, str(s)))
    check("doc outside users/{uid} -> 403", lambda: ((s := req(base, "GET", "/api/docs/jobs/x"))[0] == 403, str(s[0])))
    check("doc other user -> 403", lambda: ((s := req(base, "PUT", "/api/docs/users/bob/smoke/a", {"x": 1}))[0] == 403, str(s[0])))
    check("doc traversal -> 400/403", lambda: ((s := req(base, "GET", f"/api/docs/users/{uid}/../bob/smoke/a"))[0] in (400, 403, 404), str(s[0])))
    req(base, "DELETE", f"{d}/b")

    def job():
        s, b = req(base, "POST", "/api/jobs", {"kind": "ingest", "payload": {"uploadId": up.get("id")}})
        if s != 200: return False, str(b)
        for _ in range(50):
            s2, j = req(base, "GET", f"/api/jobs/{b['id']}")
            if j["data"]["status"] in ("done", "error"): break
            time.sleep(0.1)
        return j["data"]["status"] == "done", j["data"]["status"]
    check("job ingest -> done", job)
    check("job unknown kind -> 400", lambda: ((s := req(base, "POST", "/api/jobs", {"kind": "nope"}))[0] == 400, str(s)))
    check("job other user -> 404", lambda: ((s := req(base, "GET", "/api/jobs/doesnotexist", headers={"X-User-Id": "bob"}))[0] == 404, str(s[0])))

    def reset():
        multipart(base, "/api/uploads", "r.txt", b"hello", "text/plain")
        req(base, "PUT", f"/api/docs/users/{uid}/smoke/r", {"x": 1})
        s, b = req(base, "POST", "/api/admin/reset")
        if s != 200: return False, str(b)
        after = req(base, "GET", f"/api/docs/users/{uid}/smoke")[1]["docs"], req(base, "GET", f"/api/docs/users/{uid}/uploads")[1]["docs"]
        gone = after == ([], []) and req(base, "GET", f"/api/docs/users/{uid}/smoke/r")[0] == 404
        still_works = multipart(base, "/api/uploads", "r2.txt", b"hi", "text/plain")[0] == 200
        req(base, "POST", "/api/admin/reset")
        return gone and still_works and b["removed"]["files"] >= 1 and b["removed"]["documents"] >= 2, str(b["removed"])
    if ai:
        run_ai(base, up)
    # Last, because it wipes the uploads the AI checks reuse.
    check("admin reset wipes docs + files", reset)


def run_ai(base, up):
    schemas = json.loads((FIX / "ai_schemas.json").read_text())
    gen = lambda body: req(base, "POST", "/api/ai/generate", body)

    def plain():
        s, b = gen({"prompt": "Reply with a JSON object {\"answer\": <the capital of France>}"})
        return s == 200 and "paris" in b["text"].lower(), f"{s} {str(b)[:80]}"
    check("AI plain prompt (no schema)", plain)

    def structured():
        s, b = gen({"prompt": "Give 3 study topics about photosynthesis with ids in kebab-case.", "responseSchema": schemas["roadmap"]})
        t = json.loads(b["text"])["topics"] if s == 200 else []
        return s == 200 and len(t) >= 1 and all("id" in x for x in t), f"{s} topics={len(t)}"
    check("AI structured (real roadmap schema)", structured)

    def with_pdf():
        if not SAMPLE_PDF.exists(): return False, "sample PDF missing"
        s, b = gen({"uploadId": up["id"], "responseSchema": schemas["roadmap"], "model": "gemini-2.5-flash",
                    "prompt": "Read the attached document and split it into a study roadmap of 3 to 7 topics. Each id is unique kebab-case."})
        t = json.loads(b["text"])["topics"] if s == 200 else []
        return s == 200 and 3 <= len(t) <= 7, f"{s} topics={[x['title'] for x in t][:4]}"
    check("AI roadmap from real PDF", with_pdf)

    def with_jpg():
        if not SAMPLE_JPG.exists(): return False, "sample JPG missing"
        s, u = multipart(base, "/api/uploads", SAMPLE_JPG.name, SAMPLE_JPG.read_bytes(), "image/jpeg")
        s, b = gen({"uploadId": u["id"], "responseSchema": schemas["lesson"],
                    "prompt": "Create a short lesson (3 to 5 segments, durationInFrames 90-240) grounded only in the attached photo of notes. studyDoc is markdown notes."})
        les = json.loads(b["text"]) if s == 200 else {}
        segs = les.get("segments", [])
        return s == 200 and len(segs) >= 1 and all("scene" in x for x in segs), f"{s} segments={len(segs)} layouts={[x['scene'].get('layout', x['scene'].get('type')) for x in segs]}"
    check("AI lesson from real JPG photo (real lesson schema)", with_jpg)

    check("AI missing upload -> 404", lambda: ((s := gen({"prompt": "x", "uploadId": "nope"}))[0] == 404, str(s)))
    check("AI bad model -> 502", lambda: ((s := gen({"prompt": "hi", "model": "no-such-model-xyz"}))[0] == 502, str(s)[:120]))
    check("AI missing prompt -> 422", lambda: ((s := gen({}))[0] == 422, str(s[0])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base"); ap.add_argument("--no-ai", action="store_true")
    a = ap.parse_args()
    proc = tmp = None
    base = a.base
    if not base:
        tmp = tempfile.mkdtemp(prefix="krayon-smoke-")
        port = 8799
        env = {**os.environ, "DATA_DIR": tmp}
        proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)], cwd=ROOT, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try: urllib.request.urlopen(base + "/api/health", timeout=1); break
            except Exception: time.sleep(0.2)
    try:
        run(base, not a.no_ai)
    finally:
        if proc: proc.terminate(); proc.wait(10)
        if tmp: shutil.rmtree(tmp, ignore_errors=True)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
