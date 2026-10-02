import os
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase

# Each case sets the ones it is about; any exported in the developer's shell are dropped.
CONTROLLED_VARIABLES = ("DJANGO_DEBUG", "DJANGO_SECRET_KEY", "DJANGO_API_AUTH")


def run_with_settings(code, **env):
    """Settings are loaded once per process, so each case imports them in a subprocess."""
    environment = {key: value for key, value in os.environ.items() if key not in CONTROLLED_VARIABLES}
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=settings.BASE_DIR,
        env={**environment, **env},
        capture_output=True,
        text=True,
    )


class SecretKeyGuardTests(SimpleTestCase):
    def test_refuses_the_public_default_key_outside_debug_mode(self):
        result = run_with_settings("import server.settings", DJANGO_DEBUG="0")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Set DJANGO_SECRET_KEY", result.stderr)

    def test_starts_with_a_real_key_outside_debug_mode(self):
        result = run_with_settings("import server.settings", DJANGO_DEBUG="0", DJANGO_SECRET_KEY="x" * 50)

        self.assertEqual(result.returncode, 0, result.stderr)


class ApiAuthSwitchTests(SimpleTestCase):
    def test_only_zero_turns_authentication_off(self):
        print_switch = "from server.settings import API_AUTH_REQUIRED; print(API_AUTH_REQUIRED)"
        # Unset, "1" and anything unexpected keep authentication on.
        for value, required in [(None, True), ("1", True), ("false", True), ("0", False)]:
            with self.subTest(DJANGO_API_AUTH=value):
                env = {} if value is None else {"DJANGO_API_AUTH": value}

                result = run_with_settings(print_switch, **env)

                self.assertEqual(result.stdout.strip(), str(required), result.stderr)
