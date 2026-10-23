import hashlib
import hmac

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.db import engine

router = APIRouter(prefix="/api", tags=["auth"])

# Professors.pass_hash holds a SHA-256 hex digest (64 characters), per the database team.
PROFESSORS_BY_EMAIL_SQL = """
SELECT p.professorid, p.professorname, p.email, p.pass_hash, p.currentlevel, p.isac,
       d.departmentid, d.departmentname
FROM Professors p
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
WHERE lower(p.Email) = lower(:email)
"""

LOGIN_FAILED = "Incorrect email or password"


class LoginBody(BaseModel):
    email: str
    password: str


def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# What: a professor logs in with their email and password.
@router.post("/auth/login")
def login(body: LoginBody):
    # Input: email, password
    # Output: who logged in (401 for a wrong email or password, or an account with no password set)
    email = body.email.strip()
    if not email or not body.password:
        raise HTTPException(status_code=401, detail=LOGIN_FAILED)
    with engine.connect() as conn:
        rows = conn.execute(text(PROFESSORS_BY_EMAIL_SQL), {"email": email}).mappings().all()
    if len(rows) > 1:
        # Two professors share this email, so we can't tell who is logging in.
        raise HTTPException(status_code=409, detail="More than one account uses this email. Contact the Assessment Committee.")
    row = rows[0] if rows else None
    supplied = hash_password(body.password)
    stored = (row["pass_hash"] or "").lower() if row else ""
    # Compare even when the account is missing so a wrong email takes the same time as a wrong password.
    if not hmac.compare_digest(supplied, stored or "0" * 64) or row is None or not stored:
        raise HTTPException(status_code=401, detail=LOGIN_FAILED)
    return {
        "professor_id": row["professorid"],
        "name": row["professorname"],
        "email": row["email"],
        "current_level": row["currentlevel"],
        "department_id": row["departmentid"],
        "department_name": row["departmentname"],
        # True when this professor is on the Assessment Committee.
        "is_ac": bool(row["isac"]),
    }
