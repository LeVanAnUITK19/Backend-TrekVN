"""Export Agent API/index contracts without DB startup or reading a real .env."""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/agent-service"))

from app.config import Settings, get_settings

safe_settings = Settings(
    _env_file=None, app_env="test", agent_mongodb_uri="mongodb://localhost:27017",
    trekking_service_url="http://localhost:3003", auth_service_url="http://localhost:3001",
    trekviet_internal_token="documentation-placeholder", jwt_secret="documentation-placeholder-key-32-bytes",
)
import app.config as config
# Replace the dependency before importing routers/application; never load .env.
config.get_settings = lambda: safe_settings
import app.main as main
main.get_settings = lambda: safe_settings
app = main.create_app()
output = ROOT / "docs/openapi/agent-service.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

from app.db.indexes import create_indexes

indexes = {}

class Collection:
    def __init__(self, name):
        self.name = name

    async def create_indexes(self, values):
        indexes[self.name] = [dict(value.document) for value in values]

class Database:
    def __getitem__(self, name):
        return Collection(name)

asyncio.run(create_indexes(Database()))
output = ROOT / "docs/database/runtime/agent-indexes.json"
output.write_text(json.dumps(indexes, indent=2) + "\n", encoding="utf-8")
print(f"Exported {len(app.openapi()['paths'])} Agent paths and {len(indexes)} indexed collections")
