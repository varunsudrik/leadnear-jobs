#!/usr/bin/env python3
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_env_file(filepath):
    if not os.path.exists(filepath):
        return {}
    env = {}
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

env_local = load_env_file(os.path.join(PROJECT_ROOT, '.env.local'))

DB_HOST = env_local.get('DB_HOST', '127.0.0.1')
DB_PORT = int(env_local.get('DB_PORT', '5432'))
DB_USER = env_local.get('DB_USER', 'jobuser')
DB_PASS = env_local.get('DB_PASS', 'jobpass123')
DB_NAME = env_local.get('DB_NAME', 'jobboard')

try:
    import psycopg
except ImportError:
    print("Error: psycopg not installed. Run in project virtualenv.")
    sys.exit(1)

def get_db_conn():
    return psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        dbname=DB_NAME
    )

def main():
    print("==================================================")
    print("             RATE LIMITER STATUS REPORT           ")
    print("==================================================")
    
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection error: {e}")
        return

    # Count of blocked IPs by status
    cursor.execute("SELECT status, COUNT(*) FROM blocked_ips GROUP BY status")
    rows = cursor.fetchall()
    
    print("\nSummary Counts:")
    print("--------------------------------------------------")
    if not rows:
        print("No IP records found in blocked_ips table.")
    for status, count in rows:
        print(f"  {status.capitalize()}: {count}")

    # Display active blocked IPs
    cursor.execute(
        """
        SELECT ip_address, request_count, blocked_at, expires_at, blocked_by 
        FROM blocked_ips 
        WHERE status = 'blocked' 
        ORDER BY blocked_at DESC
        """
    )
    active_blocks = cursor.fetchall()
    
    print("\nActive Blocks (Newest First):")
    print("--------------------------------------------------")
    if not active_blocks:
        print("  No active blocks.")
    else:
        print(f"  {'IP Address':<18} | {'Requests':<8} | {'Blocked At':<19} | {'Expires At':<19} | {'By':<6}")
        print("  " + "-" * 78)
        for ip, count, blocked_at, expires_at, blocked_by in active_blocks:
            blocked_str = blocked_at.strftime('%Y-%m-%d %H:%M:%S')
            expires_str = expires_at.strftime('%Y-%m-%d %H:%M:%S')
            print(f"  {ip:<18} | {count:<8} | {blocked_str:<19} | {expires_str:<19} | {blocked_by:<6}")

    # Display last 5 events
    cursor.execute(
        """
        SELECT ip_address, status, blocked_at, unblocked_at, unblocked_by 
        FROM blocked_ips 
        ORDER BY COALESCE(unblocked_at, blocked_at) DESC 
        LIMIT 5
        """
    )
    recent_events = cursor.fetchall()
    
    print("\nRecent Activity (Last 5 actions):")
    print("--------------------------------------------------")
    if not recent_events:
        print("  No recent activity.")
    else:
        for ip, status, blocked_at, unblocked_at, unblocked_by in recent_events:
            if status == 'blocked':
                print(f"  [{blocked_at.strftime('%Y-%m-%d %H:%M:%S')}] BLOCKED   IP {ip}")
            else:
                unblock_time = unblocked_at.strftime('%Y-%m-%d %H:%M:%S') if unblocked_at else 'unknown'
                print(f"  [{unblock_time}] UNBLOCKED IP {ip} (Reason: {unblocked_by or 'unknown'})")

    cursor.close()
    conn.close()
    print("\n==================================================")

if __name__ == '__main__':
    main()
