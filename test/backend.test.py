#!/usr/bin/env python3
"""Small PocketBase + Repliz stub integration check (no real Repliz calls)."""
import json
import os
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
PB = ROOT / ".local/bin/pocketbase"
ACCOUNT = "6a88116362caae1e04010787"


def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


class ReplizStub(BaseHTTPRequestHandler):
    docs = []
    fail_page = None
    post_result = {"status": 200, "body": {"commentId": "reply-stub"}}
    post_count = 0
    followers = 4321

    def log_message(self, *_args):
        pass

    def send_json(self, status, value):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.startswith("/public/account/") and self.path.endswith("/statistic"):
            return self.send_json(200, {"Instagram": {"followersCount": 4321}})
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        page = int(query.get("page", ["1"])[0])
        if self.fail_page == page:
            return self.send_json(500, {"error": "stub failure"})
        start = (page - 1) * 100
        docs = self.docs[start:start + 100]
        return self.send_json(200, {
            "docs": docs,
            "totalDocs": len(self.docs),
            "totalPages": (len(self.docs) + 99) // 100,
            "page": page,
            "hasNextPage": start + 100 < len(self.docs),
            "nextPage": page + 1,
        })

    def do_POST(self):
        type(self).post_count += 1
        return self.send_json(self.post_result["status"], self.post_result["body"])



class JevStub(BaseHTTPRequestHandler):
    mode = "low"
    score = 0.2
    requests = []

    def log_message(self, *_args):
        pass

    def send_json(self, status, value):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except BrokenPipeError:
            pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            body = {}
        type(self).requests.append({"headers": dict(self.headers), "body": body})
        if self.mode == "timeout":
            time.sleep(7)
            return self.send_json(200, {"answers": {"is_feature_request": {"noul": self.score}}})
        if self.mode == "error":
            return self.send_json(503, {"error": "stub failure"})
        score = 0.91 if self.mode == "high" else self.score
        return self.send_json(200, {"answers": {"is_feature_request": {"noul": score}}})


class KaneoStub(BaseHTTPRequestHandler):
    requests = []
    tasks = []
    get_count = 0
    status = 200

    def log_message(self, *_args):
        pass

    def send_json(self, status, value):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except BrokenPipeError:
            pass

    def do_GET(self):
        type(self).get_count += 1
        if self.path in ("/task/tasks/project-test", "/task/project-test"):
            return self.send_json(200, {"data": {"columns": [{"slug": "in-progress", "tasks": type(self).tasks}]}, "pagination": {"totalPages": 1}})
        return self.send_json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            body = {}
        type(self).requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
        if self.status != 200:
            return self.send_json(self.status, {"error": "stub failure"})
        return self.send_json(200, {"id": f"task-{len(type(self).requests)}"})

def make_doc(index, status="pending"):
    return {
        "_id": f"queue-{index:03d}",
        "status": status,
        "accountId": ACCOUNT,
        "content": {"id": f"media-{index:03d}", "url": f"https://example.test/p/{index}"},
        "comment": {
            "id": f"comment-{index:03d}", "text": f"Komentar warga {index}",
            "createdAt": f"2026-10-30T00:{index // 60:02d}:{index % 60:02d}Z",
            "owner": {"id": f"person-{index}", "name": f"Warga {index}"}, "replies": [],
        },
    }


class BackendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repliz = ThreadingHTTPServer(("127.0.0.1", free_port()), ReplizStub)
        cls.jev = ThreadingHTTPServer(("127.0.0.1", free_port()), JevStub)
        cls.kaneo = ThreadingHTTPServer(("127.0.0.1", free_port()), KaneoStub)
        cls.repliz_thread = threading.Thread(target=cls.repliz.serve_forever, daemon=True)
        cls.jev_thread = threading.Thread(target=cls.jev.serve_forever, daemon=True)
        cls.kaneo_thread = threading.Thread(target=cls.kaneo.serve_forever, daemon=True)
        cls.repliz_thread.start()
        cls.jev_thread.start()
        cls.kaneo_thread.start()
        ReplizStub.docs = [make_doc(i) for i in range(131)]
        ReplizStub.fail_page = None
        ReplizStub.post_result = {"status": 200, "body": {"commentId": "reply-stub"}}
        JevStub.mode = "low"
        JevStub.score = 0.2
        JevStub.requests = []
        KaneoStub.status = 200
        KaneoStub.requests = []
        KaneoStub.tasks = []
        KaneoStub.get_count = 0
        cls.data = tempfile.TemporaryDirectory(prefix="desa-pb-test-")
        cls.pb_port = free_port()
        env = dict(os.environ)
        env.update({
            "DESA_ADMIN_EMAIL": "test@desa.local",
            "DESA_ADMIN_PASSWORD": "test-desakomen-123456",
            "REPLIZ_ACCOUNT_ID": ACCOUNT,
            "REPLIZ_AUTHORIZATION": "Basic dGVzdDp0ZXN0",
            "REPLIZ_API_URL": f"http://127.0.0.1:{cls.repliz.server_port}",
            "JEV_API_KEY": "jev-test-key",
            "JEV_BASE_URL": f"http://127.0.0.1:{cls.jev.server_port}",
            "JEV_MODEL": "jev-test-model",
            "JEV_THRESHOLD": "0.6",
            "KANEO_API_URL": f"http://127.0.0.1:{cls.kaneo.server_port}",
            "KANEO_API_KEY": "kaneo-test-key",
            "KANEO_PROJECT_ID": "project-test",
        })
        cls.pb = subprocess.Popen([
            str(PB), "serve", f"--http=127.0.0.1:{cls.pb_port}", "--dir=" + cls.data.name,
            "--hooksDir=" + str(ROOT / "pb_hooks"),
            "--migrationsDir=" + str(ROOT / "pb_migrations"),
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        deadline = time.time() + 10
        cls.base = None
        while time.time() < deadline:
            line = cls.pb.stdout.readline()
            if "Server started at http://" in line:
                cls.base = f"http://127.0.0.1:{cls.pb_port}"
                break
        if not cls.base:
            raise RuntimeError("PocketBase did not start")
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/api/desa/status", timeout=1)
                break
            except Exception:
                time.sleep(.05)
        cls.token = cls.request("POST", "/api/collections/admins/auth-with-password", {
            "identity": "test@desa.local", "password": "test-desakomen-123456",
        })["token"]

    @classmethod
    def tearDownClass(cls):
        cls.pb.terminate()
        try:
            cls.pb.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.pb.kill()
        if cls.pb.stdout:
            cls.pb.stdout.close()
        cls.data.cleanup()
        cls.repliz.shutdown()
        cls.repliz.server_close()
        cls.jev.shutdown()
        cls.jev.server_close()
        cls.kaneo.shutdown()
        cls.kaneo.server_close()

    @classmethod
    def request(cls, method, path, body=None, auth=True):
        data = None if body is None else json.dumps(body).encode()
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = cls.token if hasattr(cls, "token") else ""
        try:
            response = urllib.request.urlopen(urllib.request.Request(cls.base + path, data=data, method=method, headers=headers), timeout=10)
            return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            raw = error.read().decode()
            error.close()
            try:
                value = json.loads(raw)
            except ValueError:
                value = {"raw": raw}
            value["_status"] = error.code
            return value

    def sync(self):
        return self.request("POST", "/api/desa/sync")

    def test_builds_public_endpoint_and_cache(self):
        KaneoStub.tasks = [
            {"id": "task-build-1", "number": 7, "title": "Fitur hujan", "status": "in-progress", "description": "Username: @warga7\nKomentar: hujan"},
            {"id": "task-build-2", "number": 8, "title": "Jembatan", "status": "done"},
        ]
        first = self.request("GET", "/api/desa/builds", auth=False)
        self.assertEqual(first, {"builds": [
            {"id": "task-build-1", "number": 7, "title": "Fitur hujan", "status": "in-progress", "username": "warga7"},
            {"id": "task-build-2", "number": 8, "title": "Jembatan", "status": "done"},
        ]})
        self.assertEqual(KaneoStub.get_count, 1)
        second = self.request("GET", "/api/desa/builds", auth=False)
        self.assertEqual(second, first)
        self.assertEqual(KaneoStub.get_count, 1)

    def test_imports_all_pages_and_public_read(self):
        result = self.sync()
        self.assertEqual(result.get("_status"), None, result)
        self.assertEqual(result["imported"], 131)
        self.assertEqual(result["followersCount"], 4321)
        rows = self.request("GET", "/api/collections/comments/records?perPage=200", auth=False)
        self.assertEqual(rows["totalItems"], 131)
        self.assertEqual(rows["items"][0]["queueOrder"], 1)
        denied = self.request("POST", "/api/collections/comments/records", {"text": "x"}, auth=False)
        self.assertIn(denied["_status"], (400, 403))
        status = self.request("GET", "/api/desa/status", auth=False)
        self.assertEqual(status["followersCount"], 4321)

    def test_resolved_is_history_without_fabricated_reply(self):
        ReplizStub.docs[0]["status"] = "resolved"
        result = self.sync()
        self.assertEqual(result.get("_status"), None, result)
        rows = self.request("GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-000"'), auth=False)
        record = rows["items"][0]
        self.assertEqual(record["sourceStatus"], "resolved")
        self.assertEqual(record["status"], "answered")
        self.assertEqual(record["reply"], "")

    def test_reply_success_and_definite_rejection(self):
        # Resolve the first source item so queue-001 is the FIFO head.
        ReplizStub.docs[0]["status"] = "resolved"
        ReplizStub.fail_page = None
        self.sync()
        head = self.request("GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-001"'), auth=False)["items"][0]
        good = self.request("POST", "/api/desa/comments/" + head["id"] + "/reply", {"text": "Jawaban admin"})
        self.assertEqual(good.get("comment", {}).get("status"), "answered", good)
        self.assertEqual(ReplizStub.post_count, 1)
        ReplizStub.post_result = {"status": 400, "body": {"error": "bad"}}
        row = self.request("GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-002"'), auth=False)["items"][0]
        rejected = self.request("POST", "/api/desa/comments/" + row["id"] + "/reply", {"text": "Ditolak"})
        self.assertEqual(rejected["_status"], 422, rejected)
        current = self.request("GET", "/api/collections/comments/records/" + row["id"], auth=False)
        self.assertEqual(current["status"], "pending")

    def test_failed_full_scan_keeps_previous_data(self):
        before = self.request("GET", "/api/collections/comments/records?perPage=1", auth=False)["totalItems"]
        ReplizStub.fail_page = 2
        failed = self.sync()
        self.assertEqual(failed["_status"], 502, failed)
        after = self.request("GET", "/api/collections/comments/records?perPage=1", auth=False)
        self.assertEqual(after["totalItems"], before)
        self.assertTrue(self.request("GET", "/api/desa/status", auth=False).get("error"))
        ReplizStub.fail_page = None


    def test_z_feature_request_detection_task_and_resilience(self):
        # A new high-scoring comment creates one Kaneo task and stores its score/id.
        high = make_doc(131)
        high["comment"]["text"] = "Tolong tambahkan fitur hujan di desa"
        ReplizStub.docs.append(high)
        JevStub.mode = "high"
        before_jev = len(JevStub.requests)
        result = self.sync()
        self.assertIsNone(result.get("_status"), result)
        self.assertEqual(result["imported"], 1)
        self.assertEqual(len(JevStub.requests), before_jev + 1)
        self.assertEqual(len(KaneoStub.requests), 1)
        jev_body = JevStub.requests[-1]["body"]
        self.assertEqual(jev_body["model"], "jev-test-model")
        self.assertEqual(JevStub.requests[-1]["headers"]["Authorization"], "Bearer jev-test-key")
        self.assertIn(high["comment"]["text"], jev_body["state"])
        self.assertIn(high["comment"]["owner"]["name"], jev_body["state"])
        self.assertIn("is_feature_request", jev_body["questions"])
        kaneo = KaneoStub.requests[-1]
        self.assertEqual(kaneo["path"], "/task/project-test")
        self.assertEqual(kaneo["headers"]["Authorization"], "Bearer kaneo-test-key")
        self.assertIn(high["comment"]["text"], kaneo["body"]["description"])
        self.assertIn(high["comment"]["owner"]["name"], kaneo["body"]["description"])
        self.assertIn(high["content"]["url"], kaneo["body"]["description"])
        self.assertIn("comment-131", kaneo["body"]["description"])
        self.assertIn("0.91", kaneo["body"]["description"])
        self.assertEqual(kaneo["body"]["status"], "to-do")
        self.assertEqual(kaneo["body"]["priority"], "no-priority")
        self.assertTrue(kaneo["body"]["title"].startswith("Request IG:"))
        high_row = self.request(
            "GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-131"'), auth=False
        )["items"][0]
        self.assertAlmostEqual(high_row["request_score"], 0.91, places=3)
        self.assertTrue(high_row["is_request"])
        self.assertEqual(high_row["kaneo_task_id"], "task-1")

        # Duplicate sync does not call Jev again or create a second task.
        self.sync()
        self.assertEqual(len(JevStub.requests), before_jev + 1)
        self.assertEqual(len(KaneoStub.requests), 1)

        # Low score is stored but does not create a task.
        low = make_doc(132)
        low["comment"]["text"] = "Terima kasih, desanya bagus"
        ReplizStub.docs.append(low)
        JevStub.mode = "low"
        result = self.sync()
        self.assertIsNone(result.get("_status"), result)
        low_row = self.request(
            "GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-132"'), auth=False
        )["items"][0]
        self.assertAlmostEqual(low_row["request_score"], 0.2, places=3)
        self.assertFalse(low_row["is_request"])
        self.assertEqual(len(KaneoStub.requests), 1)

        # Jev timeout/error are treated as non-requests and do not fail the queue sync.
        timeout = make_doc(133)
        timeout["comment"]["text"] = "Bisa tambah mode malam?"
        ReplizStub.docs.append(timeout)
        JevStub.mode = "timeout"
        result = self.sync()
        self.assertIsNone(result.get("_status"), result)
        timeout_row = self.request(
            "GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-133"'), auth=False
        )["items"][0]
        self.assertFalse(timeout_row["is_request"])
        self.assertEqual(len(KaneoStub.requests), 1)

        error = make_doc(134)
        error["comment"]["text"] = "Buatkan fitur memancing"
        ReplizStub.docs.append(error)
        JevStub.mode = "error"
        result = self.sync()
        self.assertIsNone(result.get("_status"), result)
        error_row = self.request(
            "GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-134"'), auth=False
        )["items"][0]
        self.assertFalse(error_row["is_request"])
        self.assertEqual(len(KaneoStub.requests), 1)

        # Kaneo failure is isolated and retried on the next sync without re-running Jev.
        retry = make_doc(135)
        retry["comment"]["text"] = "Tambahkan sistem memancing"
        ReplizStub.docs.append(retry)
        JevStub.mode = "high"
        KaneoStub.status = 503
        result = self.sync()
        self.assertIsNone(result.get("_status"), result)
        self.assertEqual(len(JevStub.requests), before_jev + 5)
        self.assertEqual(len(KaneoStub.requests), 2)
        retry_row = self.request(
            "GET", "/api/collections/comments/records?filter=" + urllib.parse.quote('replizId="queue-135"'), auth=False
        )["items"][0]
        self.assertTrue(retry_row["is_request"])
        self.assertEqual(retry_row["kaneo_task_id"], "")
        KaneoStub.status = 200
        self.sync()
        self.assertEqual(len(JevStub.requests), before_jev + 5)
        self.assertEqual(len(KaneoStub.requests), 3)
        retry_row = self.request("GET", "/api/collections/comments/records/" + retry_row["id"], auth=False)
        self.assertEqual(retry_row["kaneo_task_id"], "task-3")


if __name__ == "__main__":
    unittest.main()
