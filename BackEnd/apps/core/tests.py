from django.test import SimpleTestCase
from django.urls import reverse


class HealthCheckTests(SimpleTestCase):
    def test_health_returns_ok_without_authentication(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["service"], "nucleo-backend")

    def test_health_only_accepts_get(self):
        response = self.client.post(reverse("health"), data={})

        self.assertEqual(response.status_code, 405)
