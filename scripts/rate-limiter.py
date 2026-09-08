#!/usr/bin/env python3
import os
import sys
import re
import urllib.request
import urllib.parse
import json
from email.mime.text import MIMEText
from datetime import datetime, timedelta, timezone
import subprocess

# Determine project directories
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load environment files manually to handle both .env.local and .env.ratelimiter
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
env_rate = load_env_file(os.path.join(PROJECT_ROOT, '.env.ratelimiter'))
env_monitor = load_env_file('/etc/jobs-portal-monitor.env')

# Merge configs
DB_HOST = env_local.get('DB_HOST', '127.0.0.1')
DB_PORT = int(env_local.get('DB_PORT', '5432'))
DB_USER = env_local.get('DB_USER', 'jobuser')
DB_PASS = env_local.get('DB_PASS', 'jobpass123')
DB_NAME = env_local.get('DB_NAME', 'jobboard')

VERCEL_TOKEN = env_rate.get('VERCEL_TOKEN') or env_local.get('VERCEL_TOKEN')
VERCEL_PROJECT_ID = env_rate.get('VERCEL_PROJECT_ID') or env_local.get('VERCEL_PROJECT_ID')
VERCEL_TEAM_ID = env_rate.get('VERCEL_TEAM_ID') or env_local.get('VERCEL_TEAM_ID')
ALERT_EMAILS = env_rate.get('ALERT_EMAILS') or env_local.get('ALERT_EMAILS') or env_monitor.get('ALERT_RECIPIENTS')

# SMTP configuration from jobs-portal-monitor
SMTP_HOST = env_monitor.get('SMTP_HOST')
SMTP_PORT = int(env_monitor.get('SMTP_PORT', '587')) if env_monitor.get('SMTP_PORT') else 587
SMTP_USER = env_monitor.get('SMTP_USER')
SMTP_PASSWORD = env_monitor.get('SMTP_PASSWORD')
SMTP_FROM = env_monitor.get('SMTP_FROM')

# Keep the existing crawler allow-list and extend it through environment config.
WHITELISTED_IPS = {'216.73.217.130'}
env_whitelist = env_rate.get('WHITELISTED_IPS') or env_local.get('WHITELISTED_IPS')
if env_whitelist:
    for ip in env_whitelist.split(','):
        if ip.strip():
            WHITELISTED_IPS.add(ip.strip())

# Default logs and limits
LOG_FILE = os.environ.get('LOG_FILE', '/var/log/nginx/jobs-access.log')
THRESHOLD = int(os.environ.get('THRESHOLD', '300'))
WINDOW_MINUTES = int(os.environ.get('WINDOW_MINUTES', '10'))
DRY_RUN = '--dry-run' in sys.argv

# Connect to database using psycopg
try:
    import psycopg
except ImportError:
    # Fallback to system execution of psycopg if running via default python
    print("Error: psycopg not installed. Please run this script in the project virtualenv.")
    sys.exit(1)

def get_db_conn():
    return psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        dbname=DB_NAME
    )

def parse_nginx_time(time_str):
    # Format: 28/Jun/2026:21:20:00 +0530
    # Let's remove timezone offset for parsing, but apply offset if timezone is present
    match = re.match(r'([^ ]+) ([\+\-]\d{4})', time_str)
    if not match:
        return datetime.strptime(time_str, '%d/%b/%Y:%H:%M:%S')
    
    dt_str, tz_str = match.groups()
    dt = datetime.strptime(dt_str, '%d/%b/%Y:%H:%M:%S')
    
    # Calculate timezone offset
    tz_sign = 1 if tz_str[0] == '+' else -1
    tz_hours = int(tz_str[1:3])
    tz_mins = int(tz_str[3:5])
    tz_delta = timedelta(hours=tz_hours, minutes=tz_mins)
    tz = timezone(tz_sign * tz_delta)
    
    return dt.replace(tzinfo=tz)

def send_alert_email(ip, count, ua, paths):
    if not ALERT_EMAILS:
        print("No ALERT_EMAILS configured. Skipping email alert.")
        return
    
    subject = f"[LeadNear] IP Blocked: {ip}"
    body = f"""IP {ip} has been automatically blocked on Vercel.

Details:
- Request Count: {count} requests in last {WINDOW_MINUTES} minutes (threshold: {THRESHOLD})
- User Agent: {ua}
- Sample Paths: {', '.join(paths)}
- Date/Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

This IP will be unblocked automatically after 30 days. You can also unblock it immediately from the Jobs Portal Admin Backoffice.
"""
    
    recipients = [e.strip() for e in ALERT_EMAILS.split(',') if e.strip()]
    
    # Try sending via Brevo SMTP first
    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        try:
            import smtplib
            import ssl
            from email.message import EmailMessage
            
            message = EmailMessage()
            message["Subject"] = subject
            # Falls back to a role address rather than any individual's mailbox.
            message["From"] = SMTP_FROM or "support@leadnear.com"
            message["To"] = ", ".join(recipients)
            message.set_content(body)
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(message)
                print(f"Sent email alert to {', '.join(recipients)} via SMTP")
                return
        except Exception as smtp_err:
            print(f"Failed to send email via SMTP: {smtp_err}. Falling back to sendmail...")

    # Try sending via local sendmail/postfix command as fallback
    try:
        for email in recipients:
            p = subprocess.Popen(['mail', '-s', subject, email], stdin=subprocess.PIPE, text=True)
            p.communicate(input=body)
            print(f"Sent email alert to {email} (status: {p.returncode})")
    except Exception as e:
        print(f"Error sending email via sendmail: {e}")

def block_on_vercel(ip, count, ua):
    if DRY_RUN:
        print(f"[DRY-RUN] Would block IP {ip} on Vercel")
        return True
    
    if not VERCEL_TOKEN or not VERCEL_PROJECT_ID:
        print("Vercel credentials missing. Cannot block IP on Vercel.")
        return False

    url = f"https://api.vercel.com/v1/security/firewall/config?projectId={VERCEL_PROJECT_ID}"
    if VERCEL_TEAM_ID:
        url += f"&teamId={VERCEL_TEAM_ID}"
        
    req_body = {
        "action": "ip.insert",
        "value": {
            "hostname": "leadnear.com",
            "ip": ip,
            "action": "deny",
            "notes": f"Auto-blocked: {count} req/{WINDOW_MINUTES}min on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        }
    }
    
    headers = {
        "Authorization": f"Bearer {VERCEL_TOKEN}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(req_body).encode('utf-8'),
        headers=headers,
        method='PATCH'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            print(f"Vercel Firewall response for {ip}: {response.status} - {res_body}")
            return response.status in (200, 201)
    except urllib.error.HTTPError as e:
        print(f"Vercel API error for {ip}: {e.code} - {e.read().decode('utf-8')}")
        return False
    except Exception as e:
        print(f"Vercel API connection error: {e}")
        return False

def main():
    print(f"--- Rate Limiter Run: {datetime.now()} (Dry Run: {DRY_RUN}) ---")
    
    if not os.path.exists(LOG_FILE):
        print(f"Log file not found: {LOG_FILE}")
        return

    # 1. Parse log file and count requests
    # Time window limits
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=WINDOW_MINUTES)
    
    ip_counts = {}
    ip_uas = {}
    ip_paths = {}

    # Regex to parse Nginx log line
    # Standard format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
    # Custom format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_user_agent"
    # Let's match: IP - - [time] "GET /path HTTP/1.1" status size "UA"
    log_re = re.compile(
        r'^(?P<ip>[a-fA-F0-9\.\:]+) - [^ ]+ \[(?P<time>[^\]]+)\] "(?P<request>[^"]*)" (?P<status>\d+) (?P<size>\d+) "(?P<ua>[^"]*)"'
    )

    with open(LOG_FILE, 'r') as f:
        # Since logs are written sequentially, we can read them all. For safety with large logs,
        # we parse each line but skip processing requests older than the cutoff.
        for line in f:
            m = log_re.match(line.strip())
            if not m:
                continue
            
            data = m.groupdict()
            try:
                log_dt = parse_nginx_time(data['time'])
                # Convert log time to UTC for timezone-safe comparison
                if log_dt.tzinfo is None:
                    log_dt = log_dt.replace(tzinfo=timezone.utc)
                else:
                    log_dt = log_dt.astimezone(timezone.utc)
            except Exception as e:
                # If parsing fails, skip the line
                continue

            if log_dt < cutoff:
                continue
            
            # Count request
            ip = data['ip']
            ua = data['ua']
            req = data['request']
            
            # Extract path from request e.g., "GET /jobs/some-path HTTP/1.1" -> "/jobs/some-path"
            path = req.split(' ')[1] if len(req.split(' ')) > 1 else req
            
            ip_counts[ip] = ip_counts.get(ip, 0) + 1
            ip_uas[ip] = ua # Keep last UA seen
            
            if ip not in ip_paths:
                ip_paths[ip] = set()
            if len(ip_paths[ip]) < 5: # Keep up to 5 sample paths
                ip_paths[ip].add(path)

    # 2. Process flagged IPs
    for ip, count in list(ip_counts.items()):
        if count >= THRESHOLD and ip in WHITELISTED_IPS:
            print(f"Skipping whitelisted IP: {ip} ({count} requests)")

    flagged_ips = {ip: count for ip, count in ip_counts.items() if count >= THRESHOLD and ip not in WHITELISTED_IPS}
    if not flagged_ips:
        print("No non-whitelisted IPs exceeded threshold.")
        return

    print(f"Flagged IPs: {flagged_ips}")

    # Connect to DB
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection error: {e}")
        return

    for ip, count in flagged_ips.items():
        # Check if already active block exists in DB
        cursor.execute(
            "SELECT id FROM blocked_ips WHERE ip_address = %s AND status = 'blocked'",
            (ip,)
        )
        row = cursor.fetchone()
        
        if row:
            print(f"IP {ip} is already blocked in database. Skipping.")
            continue
            
        print(f"IP {ip} exceeded threshold: {count} requests. Blocking...")
        
        # Call Vercel API
        success = block_on_vercel(ip, count, ip_uas[ip])
        
        if success:
            # Write to database
            if not DRY_RUN:
                try:
                    cursor.execute(
                        """
                        INSERT INTO blocked_ips 
                        (ip_address, request_count, user_agent, sample_paths, blocked_at, expires_at, status, blocked_by)
                        VALUES (%s, %s, %s, %s, NOW(), NOW() + INTERVAL '30 days', 'blocked', 'auto')
                        """,
                        (ip, count, ip_uas[ip], list(ip_paths[ip]))
                    )
                    conn.commit()
                    print(f"Successfully recorded block for {ip} in database.")
                except Exception as e:
                    conn.rollback()
                    print(f"Error inserting block in DB for {ip}: {e}")
            
            # Send alert email
            send_alert_email(ip, count, ip_uas[ip], list(ip_paths[ip]))
        else:
            print(f"Failed to block IP {ip} on Vercel.")

    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()
