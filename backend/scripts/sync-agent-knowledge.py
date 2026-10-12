"""Refresh Agent's copied reference docs from canonical backend contracts."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
knowledge = root / "services/agent-service/knowledge"
for service in ("auth", "checkin", "trekking"):
    shutil.copyfile(root / f"docs/{service}-service-api.md", knowledge / f"api/{service}-service-api.md")
    shutil.copyfile(root / f"docs/database/runtime/{service}-service.dbml", knowledge / f"database/trek-viet-{service}.dbml")
shutil.copyfile(root / "docs/database/services/agent.dbml", knowledge / "database/trek-viet-agent.dbml")
print("Synced canonical API/database docs into Agent knowledge")
