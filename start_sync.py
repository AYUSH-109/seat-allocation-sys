import subprocess
import re
import sys
import requests
import time

def start_tunnel_and_update_worker():
    PORT = 3001
    WORKER_URL = "https://r2-event-notifier.harshit31250.workers.dev/update-tunnel"
    DEBUG_URL = "https://r2-event-notifier.harshit31250.workers.dev/debug-kv"
    
    print(f"[*] Starting Cloudflare Tunnel on localhost:{PORT}")
    
    cmd = [
        "cloudflared", 
        "tunnel", 
        "--url", f"http://localhost:{PORT}",
        "--http-host-header", f"localhost:{PORT}"
    ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, 
        text=True,
        bufsize=1
    )

    url_pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
    url_sent = False

    try:
        for line in iter(process.stdout.readline, ''):
            sys.stdout.write(line)
            
            if not url_sent:
                match = url_pattern.search(line)
                if match:
                    extracted_url = match.group(0).strip()
                    print(f"\n[+] Extracted Tunnel URL: {extracted_url}")
                    
                    # CRITICAL: Wait for the tunnel to stabilize
                    print("[*] Waiting 5 seconds for tunnel to stabilize...")
                    time.sleep(5)
                    
                    print(f"[*] Updating Worker KV: {WORKER_URL}")
                    try:
                        resp = requests.post(WORKER_URL, json={"new_url": extracted_url}, timeout=10)
                        if resp.status_code == 200:
                            print(f"[+] Worker Response: {resp.text}")
                            
                            # VERIFICATION STEP
                            verify = requests.get(DEBUG_URL)
                            if extracted_url in verify.text:
                                print(f"✅ CONFIRMED: Worker KV is now holding: {extracted_url}\n")
                                url_sent = True
                            else:
                                print(f"❌ VERIFICATION FAILED: KV still shows: {verify.text}\n")
                        else:
                            print(f"[-] Failed. Status: {resp.status_code}\n")
                    except Exception as e:
                        print(f"[-] Request failed: {e}\n")

    except KeyboardInterrupt:
        print("\n[*] Shutting down...")
    finally:
        process.terminate()

if __name__ == "__main__":
    start_tunnel_and_update_worker()
