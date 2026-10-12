"""Quick script to inspect a map job by jobId."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env", override=True)


async def main(job_id: str) -> None:
    from app.config import get_settings
    from app.db.repositories.map_jobs import MapJobRepository
    from motor.motor_asyncio import AsyncIOMotorClient

    s = get_settings()
    client = AsyncIOMotorClient(s.agent_mongodb_uri, serverSelectionTimeoutMS=10000)
    db = client[s.agent_mongodb_db]
    repo = MapJobRepository(db)

    job = await repo.find_by_job_id(job_id)
    if not job:
        print("NOT FOUND:", job_id)
        client.close()
        return

    print("=== Job", job_id, "===")
    print("status      :", job.get("status"))
    print("adminId     :", job.get("adminId"))
    print("publishTarget:", job.get("publishTarget"))

    out = job.get("output") or {}
    print("\n=== output ===")
    print("fileName    :", out.get("fileName"))
    print("fileSizeBytes:", out.get("fileSizeBytes"))
    sha = out.get("sha256") or ""
    print("sha256      :", sha[:24] + "..." if sha else "N/A")
    tp = out.get("tempPath", "")
    print("tempPath    :", tp)
    print("file exists :", Path(tp).exists() if tp else False)

    pub = job.get("publish") or {}
    print("\n=== publish ===")
    r2 = pub.get("r2") or {}
    print("r2.uploaded :", r2.get("uploaded"))
    print("r2.objectKey:", r2.get("objectKey"))
    prod = pub.get("productionOfflineMap") or {}
    print("prod.updated:", prod.get("updated"))
    print("prod.skipped:", prod.get("skipped"))
    print("prod.lastErr :", prod.get("lastError"))

    client.close()


if __name__ == "__main__":
    jid = sys.argv[1] if len(sys.argv) > 1 else "MAP-20261007-86443752"
    asyncio.run(main(jid))
