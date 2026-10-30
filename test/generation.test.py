"""Offline checks: no credentials, network requests, or paid generations."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("desa_image_generator", Path(__file__).resolve().parents[1] / "tools/generate-images.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def expect_error(action, fragment):
    try:
        action()
    except RuntimeError as error:
        assert fragment in str(error), str(error)
    else:
        raise AssertionError(f"Expected error containing {fragment!r}")


def blocked(*args, **kwargs):
    raise AssertionError("Offline checks must never access credentials or network")


calls = []


def stub_api(response=None, error=None):
    def request(path, key, body=None):
        calls.append((path, key, body))
        if error:
            raise RuntimeError(error)
        return response
    return request


with patch.object(generator, "credential", blocked), patch.object(generator, "urlopen", blocked), patch.object(generator, "build_opener", blocked):
    for catalog in [
        {"models": [{"model_id": generator.MODEL}]},
        {"data": [{"model_id": generator.MODEL}]},
        {"data": {"models": [{"model_id": generator.MODEL}]}},
    ]:
        calls.clear()
        with patch.object(generator, "api", stub_api(catalog)):
            generator.preflight("fake-test-account")
        assert calls == [("/api/v1/models?type=image", "fake-test-account", None)]

    for catalog in [
        {"models": []}, {}, {"models": None}, {"models": "invalid"},
        {"models": [{"id": generator.MODEL}]},
        {"models": [{"model_id": generator.MODEL + "-preview"}]},
        {"models": [{"model_id": generator.MODEL.upper()}]},
        {"models": [{"model_id": "openai/gpt-image-2"}]},
    ]:
        calls.clear()
        with patch.object(generator, "api", stub_api(catalog)):
            expect_error(lambda: generator.preflight("fake-test-account"), "no generation submitted")
        assert calls == [("/api/v1/models?type=image", "fake-test-account", None)], "Catalog failure must never probe other IDs or POST"

    calls.clear()
    with patch.object(generator, "api", stub_api(error="Bumi HTTP 401: Unauthorized")):
        expect_error(lambda: generator.preflight("fake-test-account"), "401")
    assert len(calls) == 1 and calls[0][2] is None

    custom_model = "OpenAI/gpt-image-2.5-flare"
    calls.clear()
    with patch.object(generator, "api", stub_api({"models": [{"model_id": custom_model}]})):
        generator.preflight("fake-test-account", custom_model)
        expect_error(lambda: generator.preflight("fake-test-account"), "no generation submitted")
    assert len(calls) == 2 and all(body is None for _, _, body in calls)

    fake_secret = "not-a-real-secret"
    assert fake_secret not in generator.clean(f"Bearer {fake_secret}", fake_secret)
    assert generator.clean("bd_" + "A" * 20) == "[REDACTED]"
    assert generator.clean("sk-" + "Z" * 20) == "[REDACTED]"
    assert len(generator.clean("x" * 2000)) == 1000

    expected_url = "https://storage.example.invalid/asset.png"
    for field in ["url", "result_url", "resultUrl", "image_url"]:
        assert generator.image_url({field: expected_url}) == expected_url
        assert generator.image_url({field: "http://unsafe.example/asset.png"}) is None
    for field in ["result_urls", "urls", "images"]:
        assert generator.image_url({field: [expected_url]}) == expected_url
        assert generator.image_url({field: [{"url": expected_url}]}) == expected_url
        assert generator.image_url({field: []}) is None
    assert generator.image_url({"url": "javascript:alert(1)"}) is None
    assert generator.image_url({"result_url": None}) is None
    assert generator.unwrap({"data": {"id": "pilot"}}) == {"id": "pilot"}

    calls.clear()
    jobs = {"data": [{"id": "unrelated", "status": "completed", "result_url": expected_url}, {"id": "pilot", "status": "processing"}, {"id": 42, "status": "completed"}]}
    with patch.object(generator, "api", stub_api(jobs)):
        assert generator.generation("pilot", "fake-test-account") == jobs["data"][1]
        assert generator.generation("42", "fake-test-account") == jobs["data"][2]
        assert generator.generation("missing", "fake-test-account") == {"id": "missing", "status": "processing"}
    assert all(path == "/api/v1/generations?type=image&limit=50" and body is None for path, _, body in calls)
    with patch.object(generator, "api", stub_api({"data": {"id": "pilot"}})):
        expect_error(lambda: generator.generation("pilot", "fake-test-account"), "no new POST")

    with tempfile.TemporaryDirectory(prefix="desa-generation-check-") as temporary:
        directory = Path(temporary)
        prompt = directory / "prompt.txt"
        prompt.write_text("Offline test prompt", encoding="utf-8")
        argv = ["generate-images.py", "--prompt-file", str(prompt), "--output", str(directory / "assets")]
        with patch.object(sys, "argv", argv + ["--dry-run"]), contextlib.redirect_stdout(io.StringIO()) as output:
            assert generator.main() == 0
        assert '"network_requests": 0' in output.getvalue()
        assert not (directory / "assets").exists(), "Dry run must not create output"
        with patch.object(sys, "argv", argv + ["--reference", expected_url, "--dry-run"]), contextlib.redirect_stdout(io.StringIO()) as output:
            assert generator.main() == 0
        assert json.loads(output.getvalue())["parameters"]["image_urls"] == [expected_url]
        assert not (directory / "assets").exists()

        for catalog_error in [None, "Bumi HTTP 401: Unauthorized"]:
            calls.clear()
            with patch.object(generator, "credential", lambda: "fake-test-account"), patch.object(generator, "api", stub_api({"models": []}, catalog_error)), patch.object(sys, "argv", argv):
                expect_error(generator.main, "401" if catalog_error else "no generation submitted")
            assert calls == [("/api/v1/models?type=image", "fake-test-account", None)]

        for failure in ["Model not found", "Request timed out"]:
            calls.clear()

            def failed_pilot(path, key, body=None):
                calls.append((path, key, body))
                if body is None:
                    return {"models": [{"model_id": generator.MODEL}]}
                raise RuntimeError(failure)

            with patch.object(generator, "credential", lambda: "fake-test-account"), patch.object(generator, "api", failed_pilot), patch.object(sys, "argv", argv):
                expect_error(generator.main, "No automatic POST retry")
            assert len(calls) == 2
            assert calls[0] == ("/api/v1/models?type=image", "fake-test-account", None)
            assert calls[1][0] == "/api/v1/image/generate" and calls[1][2]["model_id"] == generator.MODEL

print("Generation checks passed: authenticated exact-model gate, no probes/retries, redaction, URLs, and history IDs.")
