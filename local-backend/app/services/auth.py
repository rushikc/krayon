"""Stub of Firebase Auth. Replace current_user with ID-token verification (firebase_admin.auth.verify_id_token)."""
from dataclasses import dataclass

from fastapi import Header


@dataclass
class User:
    uid: str
    email: str


async def current_user(x_user_id: str | None = Header(default=None)) -> User:
    uid = x_user_id or "local-user"
    return User(uid=uid, email=f"{uid}@localhost")
