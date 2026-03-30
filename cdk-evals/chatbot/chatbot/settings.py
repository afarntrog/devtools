import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-secret-key-change-in-production")

DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() == "true"

ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "corsheaders",
    "chat",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "chatbot.urls"

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
]

DASHBOARD_URL = os.getenv("DASHBOARD_URL")
if DASHBOARD_URL:
    CORS_ALLOWED_ORIGINS.append(DASHBOARD_URL)

SESSIONS_DB_PATH = os.getenv("SESSIONS_DB_PATH", str(BASE_DIR / "sessions.db"))

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": SESSIONS_DB_PATH,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
