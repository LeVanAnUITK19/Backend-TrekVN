#!/usr/bin/env python3
"""
Check map job in MongoDB
Usage: python scripts/check_map_job.py MAP-20261006-A69F669E
"""

import os
import sys
import asyncio
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import json

async def check_job(job_id: str):
    load_dotenv()
    
    uri = os.getenv("AGENT_MONGODB_URI")
    db_name = os.getenv("AGENT_MONGODB_DB", "trekviet_agent")
    
    if not uri:
        print("❌ AGENT_MONGODB_URI not found in .env")
        return
    
    print(f"🔍 Checking job: {job_id}")
    print(f"   DB: {db_name}\n")
    
    try:
        client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
        )
        
        db = client[db_name]
        col = db["map_jobs"]
        
        # Find job
        job = await col.find_one({"jobId": job_id})
        
        if not job:
            print(f"❌ Job not found: {job_id}")
            
            # Show recent jobs
            print("\n📋 Recent 5 jobs:")
            cursor = col.find().sort("createdAt", -1).limit(5)
            async for doc in cursor:
                print(f"   - {doc.get('jobId')}: {doc.get('placeName')} ({doc.get('status')})")
            
            client.close()
            return
        
        # Remove _id for clean JSON
        job.pop("_id", None)
        
        print(f"✅ Job found!")
        print(f"\n📄 Job data:")
        print(json.dumps(job, indent=2, default=str))
        
        # Check key fields
        print(f"\n🔑 Key fields:")
        print(f"   Job ID: {job.get('jobId')}")
        print(f"   Place Name: {job.get('placeName')}")  # ← CHO XEM TÊN
        print(f"   Status: {job.get('status')}")
        print(f"   BBOX: {job.get('input', {}).get('bbox')}")
        
        output = job.get('output', {})
        if output:
            print(f"\n📦 Output:")
            print(f"   File: {output.get('fileName')}")
            print(f"   Size: {output.get('fileSizeBytes')} bytes")
            print(f"   Path: {output.get('tempPath')}")
        
        client.close()
        
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}")
        print(f"   {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/check_map_job.py <JOB_ID>")
        sys.exit(1)
    
    job_id = sys.argv[1]
    asyncio.run(check_job(job_id))
