#!/usr/bin/env python3
"""Test if UIT LLM supports function calling."""
import asyncio
import httpx
import json

UIT_BASE_URL = "https://llm.uit.edu.vn/gemma/v1"
UIT_API_KEY = "sk-uit-V1sRLf30CZhDl4b0ryimuxL8DHGf8HuN"
UIT_MODEL = "gemma-4-26b"


async def test_with_tools():
    """Test with tools/function calling."""
    print("Testing UIT LLM with tools/function calling...")
    
    payload = {
        "model": UIT_MODEL,
        "messages": [
            {"role": "user", "content": "What places are available?"}
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "search_places",
                    "description": "Search for places",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"}
                        }
                    }
                }
            }
        ],
        "tool_choice": "auto"
    }
    
    print(f"\nPayload:\n{json.dumps(payload, indent=2)}\n")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{UIT_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {UIT_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        
        print(f"Status: {resp.status_code}")
        print(f"Response:\n{resp.text}\n")
        
        if resp.is_success:
            print("SUCCESS - UIT supports function calling")
        else:
            print("FAILED - UIT does NOT support function calling")
            print("This is the root cause of the 400 error!")
    except Exception as e:
        print(f"EXCEPTION: {e}")


asyncio.run(test_with_tools())
