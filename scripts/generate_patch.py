import base64
import time
import os
from datetime import datetime, timedelta

def generate_key(days_valid=30):
    expiry_date = datetime.now() + timedelta(days=days_valid)
    expiry_ts = int(expiry_date.timestamp())
    
    # Simple obfuscation: XOR with a key then base64
    key = b"antigravity-secure-key-2026"
    ts_str = str(expiry_ts).encode()
    
    obfuscated = bytes([ts_str[i] ^ key[i % len(key)] for i in range(len(ts_str))])
    encoded = base64.b64encode(obfuscated).decode()
    
    with open(".license.key", "w") as f:
        f.write(encoded)
    
    print(f"License key generated successfully!")
    print(f"Expires on: {expiry_date.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"File created: .license.key")

if __name__ == "__main__":
    import sys
    days = 30
    if len(sys.argv) > 1:
        try:
            days = int(sys.argv[1])
        except ValueError:
            pass
    generate_key(days)
