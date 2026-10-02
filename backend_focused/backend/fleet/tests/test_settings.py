import os
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase


class SecretKeyGuardTests(SimpleTestCase):
    """Settings are loaded once per process, so each case imports them in a subprocess."""

    def import_settings(self, **env):
        environment = {key: value for key, value in os.environ.items() if key != "DJANGO_SECRET_KEY"}
        return subprocess.run(
            [sys.executable, "-c", "import server.settings"],
            cwd=settings.BASE_DIR,
            env={**environment, **env},
            capture_output=True,
            text=True,
        )

    def test_refuses_the_public_default_key_outside_debug_mode(self):
        result = self.import_settings(DJANGO_DEBUG="0")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Set DJANGO_SECRET_KEY", result.stderr)

    def test_starts_with_a_real_key_outside_debug_mode(self):
        result = self.import_settings(DJANGO_DEBUG="0", DJANGO_SECRET_KEY="x" * 50)

        self.assertEqual(result.returncode, 0, result.stderr)
