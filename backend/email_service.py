import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("email_service")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip(' "\'')
SENDER_EMAIL = os.environ.get("RESEND_SENDER_EMAIL", "onboarding@resend.dev").strip(' "\'')

def send_enrollment_email(recipient_email: str, otp_code: str, token: str, master_hub_url: str, admin_user: str) -> tuple[bool, str]:
    """Sends an enrollment email with 6-digit OTP pairing code and pairing command via Resend."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured. Email sending skipped.")
        return False, "RESEND_API_KEY is missing in backend environment (.env file)."

    try:
        import resend
        resend.api_key = RESEND_API_KEY

        subject = f"🔑 Device Pairing Code: {otp_code} (PulseLinux Fleet Management)"

        html_content = f"""
        <div style="font-family: monospace, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 24px; border-radius: 8px; max-width: 560px; margin: 0 auto; border: 1px solid #27272a;">
            <h2 style="color: #4ade80; margin-top: 0; font-size: 1.2rem;">🖥️ PulseLinux System Vitals Fleet Management</h2>
            <p style="color: #a1a1aa; font-size: 0.88rem;">
                Administrator <strong>{admin_user}</strong> has issued a device enrollment pairing key for your system.
            </p>
            
            <div style="background-color: #18181b; border: 1px solid #3f3f46; border-radius: 6px; padding: 18px; margin: 20px 0; text-align: center;">
                <div style="font-size: 0.72rem; color: #a1a1aa; letter-spacing: 1px; margin-bottom: 6px; text-transform: uppercase;">6-Digit Security Pairing Code (OTP)</div>
                <div style="font-size: 2.4rem; font-weight: bold; color: #38bdf8; letter-spacing: 6px; font-family: monospace;">{otp_code}</div>
                <div style="font-size: 0.7rem; color: #71717a; margin-top: 6px;">Valid for 24 Hours • One-time activation</div>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.8rem; color: #e4e4e7; font-weight: bold; margin-bottom: 8px;">🚀 Quick Terminal Setup Command:</div>
                <div style="background-color: #000000; border: 1px solid #27272a; padding: 12px; border-radius: 4px; color: #4ade80; font-size: 0.78rem; word-break: break-all; font-family: monospace;">
                    ENROLL_TOKEN="{token}" HUB_URL="{master_hub_url}" sudo -E ./install-daemon.sh
                </div>
            </div>

            <p style="font-size: 0.72rem; color: #71717a; border-top: 1px solid #27272a; padding-top: 12px; margin-bottom: 0;">
                If you did not request this pairing code, please contact your fleet administrator.
            </p>
        </div>
        """

        params = {
            "from": SENDER_EMAIL,
            "to": [recipient_email],
            "subject": subject,
            "html": html_content
        }

        resp = resend.Emails.send(params)
        msg_id = resp.get("id") if isinstance(resp, dict) else getattr(resp, "id", "ok")
        logger.info(f"Resend email sent to {recipient_email} (Message ID: {msg_id})")
        return True, f"Enrollment email with OTP code {otp_code} sent to {recipient_email}"
    except Exception as e:
        logger.error(f"Failed to send Resend email: {e}")
        return False, f"Resend API Error: {str(e)}"
