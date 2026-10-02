from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .helpers import fast_password_hashing

PASSWORD = "s3cret-pass"


# Pinned, so these tests hold even when the suite runs with DJANGO_API_AUTH=0.
@override_settings(API_AUTH_REQUIRED=True)
@fast_password_hashing
class AuthenticationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        get_user_model().objects.create_user(username="ann", password=PASSWORD)

    def obtain_tokens(self, password=PASSWORD):
        return self.client.post(reverse("token-obtain"), {"username": "ann", "password": password})

    def test_endpoints_require_authentication(self):
        for url in [reverse("api-root"), reverse("vehicle-list"), reverse("office-summary")]:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
                self.assertTrue(response["WWW-Authenticate"].startswith("Bearer"))

    def test_access_token_grants_access(self):
        tokens = self.obtain_tokens()
        self.assertEqual(tokens.status_code, status.HTTP_200_OK)
        self.assertEqual(set(tokens.data), {"access", "refresh"})

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.data['access']}")

        self.assertEqual(self.client.get(reverse("vehicle-list")).status_code, status.HTTP_200_OK)

    def test_wrong_password_gets_no_token(self):
        response = self.obtain_tokens(password="wrong")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")

        response = self.client.get(reverse("vehicle-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_issues_a_new_access_token(self):
        refresh = self.obtain_tokens().data["refresh"]

        response = self.client.post(reverse("token-refresh"), {"refresh": refresh})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_docs_and_schema_are_public(self):
        for name in ("schema", "docs"):
            with self.subTest(page=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, status.HTTP_200_OK)

    def test_session_login_works_for_the_browsable_api(self):
        self.client.login(username="ann", password=PASSWORD)

        response = self.client.get(reverse("vehicle-list"), HTTP_ACCEPT="text/html")

        self.assertEqual(response.status_code, status.HTTP_200_OK)


@override_settings(API_AUTH_REQUIRED=False)
class AuthenticationSwitchedOffTests(APITestCase):
    """DJANGO_API_AUTH=0: the API as the brief describes it, without authentication."""

    def test_endpoints_are_open_without_a_token(self):
        created = self.client.post(reverse("office-list"), {"name": "Denver", "city": "Denver"})
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        for url in [reverse("api-root"), reverse("vehicle-list"), reverse("office-summary")]:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
