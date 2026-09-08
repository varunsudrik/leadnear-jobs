#!/usr/bin/env python3
import os
import sys
import urllib.request
import urllib.parse
import json
from email.mime.text import MIMEText
from datetime import datetime
import subprocess

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
env_rate = load_env_file(os.path.join(PROJECT_ROOT, '.env.ratelimiter'))
env_monitor = load_env_file('/etc/jobs-portal-monitor.env')

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

DRY_RUN = '--dry-run' in sys.argv

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

def unblock_on_vercel(ip):
    if DRY_RUN:
        print(f"[DRY-RUN] Would unblock IP {ip} on Vercel")
        return True
    
    if not VERCEL_TOKEN or not VERCEL_PROJECT_ID:
        print("Vercel credentials missing. Cannot unblock IP on Vercel.")
        return False

    url = f"https://api.vercel.com/v1/security/firewall/config?projectId={VERCEL_PROJECT_ID}"
    if VERCEL_TEAM_ID:
        url += f"&teamId={VERCEL_TEAM_ID}"

    # 1. Fetch current firewall configuration to find the entry ID
    get_req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
        method='GET'
    )
    
    try:
        with urllib.request.urlopen(get_req) as response:
            config_data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch Vercel config: {e}")
        return False

    active_ips = config_data.get('active', {}).get('ips', [])
    draft_ips = config_data.get('draft', {}).get('ips', [])
    found_entry = None
    for entry in active_ips + draft_ips:
        if entry.get('ip') == ip:
            found_entry = entry
            break

    if not found_entry or not found_entry.get('id'):
        print(f"IP {ip} not found in Vercel active or draft configuration. Assuming already removed.")
        return True

    entry_id = found_entry['id']

    # 2. Call Vercel API to remove IP block using ID
    req_body = {
        "action": "ip.remove",
        "id": entry_id
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
            print(f"Vercel Firewall response for unblocking {ip} (ID: {entry_id}): {response.status} - {res_body}")
            return response.status in (200, 201)
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode('utf-8')
        print(f"Vercel API error when unblocking {ip}: {e.code} - {error_msg}")
        if e.code == 404 or "not_found" in error_msg:
            return True
        return False
    except Exception as e:
        print(f"Vercel API connection error: {e}")
        return False

def send_expiry_email(ips):
    if not ALERT_EMAILS or not ips:
        return
    
    subject = f"[LeadNear] IP Blocks Expired"
    ips_str = '\n'.join([f"- {ip}" for ip in ips])
    body = f"""The following IP addresses have reached their 30-day block limits and have been automatically unblocked on Vercel:

{ips_str}

Date/Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
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
                print(f"Sent expiry report to {', '.join(recipients)} via SMTP")
                return
        except Exception as smtp_err:
            print(f"Failed to send email via SMTP: {smtp_err}. Falling back to sendmail...")

    # Try sending via local sendmail/postfix command as fallback
    try:
        for email in recipients:
            p = subprocess.Popen(['mail', '-s', subject, email], stdin=subprocess.PIPE, text=True)
            p.communicate(input=body)
            print(f"Sent expiry report to {email} (status: {p.returncode})")
    except Exception as e:
        print(f"Error sending email via sendmail: {e}")

def main():
    print(f"--- Rate Limiter Expiry Run: {datetime.now()} (Dry Run: {DRY_RUN}) ---")
    
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection error: {e}")
        return

    # Find expired blocks
    cursor.execute(
        "SELECT id, ip_address FROM blocked_ips WHERE expires_at < NOW() AND status = 'blocked'"
    )
    rows = cursor.fetchall()
    
    if not rows:
        print("No expired IP blocks found.")
        cursor.close()
        conn.close()
        return

    unblocked_ips = []
    
    for row_id, ip in rows:
        print(f"IP {ip} block expired. Unblocking...")
        success = unblock_on_vercel(ip)
        if success:
            if not DRY_RUN:
                try:
                    cursor.execute(
                        """
                        UPDATE blocked_ips 
                        SET status = 'expired', unblocked_at = NOW(), unblocked_by = 'auto-expire'
                        WHERE id = %s
                        """,
                        (row_id,)
                    )
                    conn.commit()
                    print(f"Successfully updated status for IP {ip} in database.")
                except Exception as e:
                    conn.rollback()
                    print(f"Error updating DB status for {ip}: {e}")
                    continue
            unblocked_ips.append(ip)
        else:
            print(f"Failed to unblock IP {ip} on Vercel.")

    if unblocked_ips:
        send_expiry_email(unblocked_ips)

    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()
