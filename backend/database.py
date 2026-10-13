import os
import time
import secrets
import logging
from typing import Dict, Any, List, Optional
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger("database")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip(' "\'')

use_ssl = False
if DATABASE_URL:
    import re
    if "sslmode=require" in DATABASE_URL or "neon.tech" in DATABASE_URL:
        use_ssl = True
    DATABASE_URL = re.sub(r'[&?]channel_binding=[^&]+', '', DATABASE_URL)
    DATABASE_URL = re.sub(r'[&?]sslmode=[^&]+', '', DATABASE_URL)
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, BigInteger

Base = declarative_base()

class AdminUserDB(Base):
    __tablename__ = "admin_users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, index=True, nullable=True)
    password_hash = Column(String, nullable=True)
    salt = Column(String, nullable=True)
    clerk_id = Column(String, index=True, nullable=True)
    role = Column(String, default="admin")
    created_at = Column(BigInteger, default=lambda: int(time.time()))

class DeviceDB(Base):
    __tablename__ = "fleet_devices"
    device_id = Column(String, primary_key=True)
    hostname = Column(String, index=True)
    ip = Column(String)
    distro_name = Column(String)
    distro_id = Column(String)
    owner_admin = Column(String, index=True)
    status = Column(String, default="offline")
    last_seen = Column(BigInteger, default=lambda: int(time.time()))

class EnrollmentCodeDB(Base):
    __tablename__ = "enrollment_codes"
    id = Column(String, primary_key=True)
    otp_code = Column(String(6), index=True)
    token = Column(String, unique=True, index=True)
    recipient_email = Column(String, index=True)
    owner_admin = Column(String)
    created_at = Column(BigInteger, default=lambda: int(time.time()))
    expires_at = Column(BigInteger)
    is_used = Column(Boolean, default=False)

class ConnectionLogDB(Base):
    __tablename__ = "connection_logs"
    id = Column(String, primary_key=True)
    device_id = Column(String, index=True)
    event = Column(String) # 'CONNECTED', 'DISCONNECTED', 'CLEARED'
    timestamp = Column(BigInteger, default=lambda: int(time.time()))

engine = None
AsyncSessionLocal = None

if DATABASE_URL:
    try:
        connect_args = {}
        if use_ssl:
            connect_args["ssl"] = "require"

        engine = create_async_engine(
            DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
            connect_args=connect_args
        )
        AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        logger.info("Neon DB connection initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Neon DB engine: {e}")

async def init_db():
    if engine:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Neon DB database tables verified/created successfully.")
        except Exception as e:
            logger.error(f"Error creating Neon DB tables: {e}")

async def db_register_device(device_id: str, hostname: str, ip: str, distro_name: str, distro_id: str, owner_admin: str):
    if not AsyncSessionLocal: return
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                dev = await session.get(DeviceDB, device_id)
                if not dev:
                    dev = DeviceDB(
                        device_id=device_id,
                        hostname=hostname,
                        ip=ip,
                        distro_name=distro_name,
                        distro_id=distro_id,
                        owner_admin=owner_admin,
                        status="online",
                        last_seen=int(time.time())
                    )
                    session.add(dev)
                else:
                    dev.hostname = hostname
                    dev.ip = ip
                    dev.distro_name = distro_name
                    dev.distro_id = distro_id
                    dev.owner_admin = owner_admin
                    dev.status = "online"
                    dev.last_seen = int(time.time())
                
                # Log connection
                log = ConnectionLogDB(
                    id=f"log-{secrets.token_hex(8)}",
                    device_id=device_id,
                    event="CONNECTED",
                    timestamp=int(time.time())
                )
                session.add(log)
    except Exception as e:
        logger.error(f"DB register device error: {e}")

async def db_mark_device_offline(device_id: str):
    if not AsyncSessionLocal: return
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                dev = await session.get(DeviceDB, device_id)
                if dev:
                    dev.status = "offline"
                    log = ConnectionLogDB(
                        id=f"log-{secrets.token_hex(8)}",
                        device_id=device_id,
                        event="DISCONNECTED",
                        timestamp=int(time.time())
                    )
                    session.add(log)
    except Exception as e:
        logger.error(f"DB mark offline error: {e}")

async def db_clear_all_connections():
    """Wipes all active connection statuses and logs CLEARED in Neon DB."""
    if not AsyncSessionLocal: return
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from sqlalchemy import update
                await session.execute(update(DeviceDB).values(status="offline"))
                log = ConnectionLogDB(
                    id=f"log-{secrets.token_hex(8)}",
                    device_id="ALL_DEVICES",
                    event="CLEARED",
                    timestamp=int(time.time())
                )
                session.add(log)
        logger.info("Neon DB: Cleared all device active connection states.")
    except Exception as e:
        logger.error(f"DB clear all error: {e}")

async def db_create_enrollment_otp(recipient_email: str, owner_admin: str) -> tuple[str, str]:
    """Generates a 6-digit OTP pairing code and secret token in Neon DB."""
    otp_code = f"{secrets.randbelow(900000) + 100000}" # 6-digit secure numeric OTP
    token = f"pulse_enroll_{secrets.token_hex(16)}"
    expires_at = int(time.time()) + (24 * 3600) # 24 hours validity

    if AsyncSessionLocal:
        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    record = EnrollmentCodeDB(
                        id=f"enc-{secrets.token_hex(8)}",
                        otp_code=otp_code,
                        token=token,
                        recipient_email=recipient_email,
                        owner_admin=owner_admin,
                        created_at=int(time.time()),
                        expires_at=expires_at,
                        is_used=False
                    )
                    session.add(record)
        except Exception as e:
            logger.error(f"Error saving enrollment code in DB: {e}")

    return otp_code, token

async def db_verify_and_consume_otp(otp_code: str) -> Optional[tuple[str, str]]:
    """Verifies a 6-digit OTP code, marks it as used, and returns (owner_admin, device_token)."""
    if not AsyncSessionLocal:
        return None
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from sqlalchemy import select
                stmt = select(EnrollmentCodeDB).where(
                    EnrollmentCodeDB.otp_code == otp_code,
                    EnrollmentCodeDB.is_used == False,
                    EnrollmentCodeDB.expires_at > int(time.time())
                )
                res = await session.execute(stmt)
                record = res.scalars().first()
                if record:
                    record.is_used = True
                    return record.owner_admin, record.token
    except Exception as e:
        logger.error(f"DB verify OTP error: {e}")
    return None

async def db_verify_device_token(token: str) -> Optional[str]:
    """Verifies persistent device enrollment token without consuming it."""
    if not AsyncSessionLocal:
        return None
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from sqlalchemy import select
                stmt = select(EnrollmentCodeDB).where(
                    EnrollmentCodeDB.token == token,
                    EnrollmentCodeDB.expires_at > int(time.time())
                )
                res = await session.execute(stmt)
                record = res.scalars().first()
                if record:
                    return record.owner_admin
    except Exception as e:
        logger.error(f"DB verify device token error: {e}")
    return None

async def db_verify_otp_or_token(otp_or_token: str) -> Optional[str]:
    """Verifies OTP code or token from Neon DB."""
    if not AsyncSessionLocal:
        return None
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from sqlalchemy import select, or_
                stmt = select(EnrollmentCodeDB).where(
                    or_(EnrollmentCodeDB.otp_code == otp_or_token, EnrollmentCodeDB.token == otp_or_token),
                    EnrollmentCodeDB.expires_at > int(time.time())
                )
                res = await session.execute(stmt)
                record = res.scalars().first()
                if record:
                    if record.otp_code == otp_or_token:
                        if record.is_used:
                            return None
                        record.is_used = True
                    return record.owner_admin
    except Exception as e:
        logger.error(f"DB verify OTP error: {e}")
    return None

async def db_sync_clerk_user(clerk_id: str, email: str, username: str = None, role: str = "admin") -> Dict[str, Any]:
    """Syncs a Clerk user with Neon PostgreSQL admin_users table."""
    if not clerk_id: return {"status": "error", "message": "Missing clerk_id"}
    user_data = {
        "id": f"usr-{clerk_id[-8:]}" if clerk_id else f"usr-{secrets.token_hex(6)}",
        "clerk_id": clerk_id,
        "email": email or "",
        "username": username or (email.split("@")[0] if email else f"user_{clerk_id[-6:]}"),
        "role": role,
        "created_at": int(time.time())
    }

    if AsyncSessionLocal:
        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    from sqlalchemy import select
                    stmt = select(AdminUserDB).where(AdminUserDB.clerk_id == clerk_id)
                    res = await session.execute(stmt)
                    existing = res.scalars().first()
                    if existing:
                        existing.email = user_data["email"]
                        existing.username = user_data["username"]
                        user_data["id"] = existing.id
                        user_data["role"] = existing.role
                    else:
                        new_user = AdminUserDB(
                            id=user_data["id"],
                            username=user_data["username"],
                            email=user_data["email"],
                            clerk_id=clerk_id,
                            role=role,
                            created_at=user_data["created_at"]
                        )
                        session.add(new_user)
            logger.info(f"Neon DB: Synced Clerk user {clerk_id} ({user_data['username']})")
        except Exception as e:
            logger.error(f"Error syncing Clerk user to Neon DB: {e}")

    return user_data

async def db_register_admin_user(username: str, password_hash: str, salt: str, email: str = None, role: str = "admin") -> bool:
    """Registers a new admin user account in Neon PostgreSQL DB."""
    if not AsyncSessionLocal:
        return False
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                from sqlalchemy import select
                stmt = select(AdminUserDB).where(AdminUserDB.username == username)
                res = await session.execute(stmt)
                existing = res.scalars().first()
                if existing:
                    existing.password_hash = password_hash
                    existing.salt = salt
                    existing.role = role
                    if email:
                        existing.email = email
                else:
                    new_user = AdminUserDB(
                        id=f"adm-{secrets.token_hex(8)}",
                        username=username,
                        email=email or f"{username}@local",
                        password_hash=password_hash,
                        salt=salt,
                        role=role,
                        created_at=int(time.time())
                    )
                    session.add(new_user)
        logger.info(f"Neon DB: Registered/Updated admin user account: {username}")
        return True
    except Exception as e:
        logger.error(f"Error registering admin user in Neon DB: {e}")
        return False

async def db_authenticate_admin_user(username: str) -> Optional[Dict[str, Any]]:
    """Fetches user credentials from Neon PostgreSQL DB for authentication."""
    if not AsyncSessionLocal:
        return None
    try:
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            stmt = select(AdminUserDB).where(AdminUserDB.username == username)
            res = await session.execute(stmt)
            u = res.scalars().first()
            if u:
                return {
                    "id": u.id,
                    "username": u.username,
                    "password_hash": u.password_hash,
                    "salt": u.salt,
                    "role": u.role or "admin"
                }
    except Exception as e:
        logger.error(f"Error querying admin user in Neon DB: {e}")
    return None

async def db_get_devices_for_owner(owner_admin: str) -> List[Dict[str, Any]]:
    """Fetches all registered devices owned by an admin from Neon DB."""
    devices = []
    if not AsyncSessionLocal:
        return devices
    try:
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            # 'admin' or master role can see all devices, regular admins see their owned devices
            if owner_admin.lower() in ["admin", "root", "master", "pulse-admin"]:
                stmt = select(DeviceDB)
            else:
                stmt = select(DeviceDB).where(DeviceDB.owner_admin == owner_admin)
            res = await session.execute(stmt)
            records = res.scalars().all()
            for d in records:
                devices.append({
                    "device_id": d.device_id,
                    "hostname": d.hostname,
                    "ip": d.ip,
                    "distro_name": d.distro_name,
                    "distro_id": d.distro_id,
                    "owner_admin": d.owner_admin,
                    "status": d.status,
                    "last_seen": d.last_seen
                })
    except Exception as e:
        logger.error(f"Error fetching devices for owner from Neon DB: {e}")
async def db_get_all_admin_users() -> List[Dict[str, Any]]:
    """Fetches all registered users from Neon DB."""
    users = []
    if AsyncSessionLocal:
        try:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import select
                stmt = select(AdminUserDB)
                res = await session.execute(stmt)
                records = res.scalars().all()
                for u in records:
                    users.append({
                        "id": u.id,
                        "clerk_id": u.clerk_id,
                        "username": u.username,
                        "email": u.email,
                        "role": u.role,
                        "created_at": u.created_at
                    })
        except Exception as e:
            logger.error(f"Error fetching users from Neon DB: {e}")
    return users


