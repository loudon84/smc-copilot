from __future__ import annotations

from fastapi import APIRouter

from api.v1 import artifacts, desired_state, enrollments, health, job_returns, jobs, migrations, rollouts, secrets

api_router = APIRouter(prefix="/salt/v1")
api_router.include_router(health.router)
api_router.include_router(enrollments.router)
api_router.include_router(desired_state.router)
api_router.include_router(job_returns.router)
api_router.include_router(jobs.router)
api_router.include_router(migrations.router)
api_router.include_router(secrets.router)
api_router.include_router(artifacts.router)
api_router.include_router(rollouts.router)
