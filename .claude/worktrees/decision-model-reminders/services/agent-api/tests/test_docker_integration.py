"""Opt-in boundary smoke check against the real worker image, never an in-process mock."""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration


@pytest.mark.skipif(
    os.getenv("RUN_AGENT_INTEGRATION") != "1" or not shutil.which("docker"),
    reason="set RUN_AGENT_INTEGRATION=1 with Docker running and the worker image built",
)
def test_worker_image_runs_nonroot_with_readonly_root_and_only_task_workspace():
    image = os.getenv("CORTEX_AGENT_DOCKER_IMAGE", "cortex-agent-worker:local")
    # Colima shares the checkout/home, whereas macOS's private pytest temp dir may not be shared.
    data = Path(__file__).resolve().parents[1] / ".data"
    data.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="boundary-", dir=data) as workspace:
        result = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,noexec,nosuid,size=64m",
                "--mount",
                f"type=bind,src={workspace},dst=/workspace",
                "--entrypoint",
                "sh",
                image,
                "-c",
                'test "$(id -u)" = 10001 && test -w /workspace && test ! -w /app',
            ],
            text=True,
            capture_output=True,
            check=False,
            timeout=30,
        )
        assert result.returncode == 0, result.stderr
