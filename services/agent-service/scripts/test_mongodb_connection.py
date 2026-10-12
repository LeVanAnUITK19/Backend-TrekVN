#!/usr/bin/env python3
"""
Test MongoDB connection
Usage: python scripts/test_mongodb_connection.py
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pymongo import MongoClient
from dotenv import load_dotenv

def test_connection():
    # Load .env
    load_dotenv()
    
    uri = os.getenv("AGENT_MONGODB_URI")
    db_name = os.getenv("AGENT_MONGODB_DB", "trekviet_agent")
    
    if not uri:
        print("❌ AGENT_MONGODB_URI not found in .env")
        return False
    
    print(f"🔍 Testing connection to MongoDB...")
    print(f"   URI: {uri[:30]}...{uri[-20:]}")  # Hide credentials
    print(f"   DB: {db_name}\n")
    
    try:
        # Create client with short timeout
        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
        )
        
        # Test connection
        print("⏳ Pinging MongoDB...")
        client.admin.command('ping')
        
        # Get server info
        server_info = client.server_info()
        print(f"✅ Connected successfully!")
        print(f"   MongoDB version: {server_info.get('version')}")
        
        # Test database access
        db = client[db_name]
        collections = db.list_collection_names()
        print(f"   Database: {db_name}")
        print(f"   Collections: {len(collections)}")
        if collections:
            print(f"   - {', '.join(collections[:5])}")
        
        client.close()
        return True
        
    except Exception as e:
        print(f"❌ Connection failed!")
        print(f"   Error: {type(e).__name__}")
        print(f"   Message: {str(e)}\n")
        
        # Troubleshooting hints
        if "timed out" in str(e).lower():
            print("💡 Troubleshooting:")
            print("   1. Check IP whitelist on MongoDB Atlas")
            print("   2. Check firewall/antivirus blocking port 27017")
            print("   3. Try increasing timeout in .env:")
            print("      connectTimeoutMS=30000&serverSelectionTimeoutMS=30000")
            print("   4. Or use local MongoDB: mongodb://localhost:27017")
        
        elif "authentication failed" in str(e).lower():
            print("💡 Troubleshooting:")
            print("   1. Check username/password in AGENT_MONGODB_URI")
            print("   2. Verify user exists on MongoDB Atlas")
            print("   3. Check user has readWrite permissions on database")
        
        return False

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
